import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, JurorEditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CertificatesService } from '../src/certificates/certificates.service';
import { fairNameOf } from '../src/certificates/fair-name';
import { EmailService } from '../src/email/email.service';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * ARK-170 (TA-19): certificados por HTTP contra PostgreSQL real, con la aplicación completa. Solo
 * se simulan la salida a Gotenberg y el envío del correo; el HTML generado sí se revisa.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * No cambia la edición activa ni su cronograma (las e2e corren en paralelo).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';
process.env.GOTENBERG_URL ??= 'http://gotenberg.invalid';
process.env.EVENT_DATE_TEXT ??= '26 de noviembre';
process.env.EVENT_TIME_TEXT ??= '8:00 am';
process.env.EVENT_PLACE_TEXT ??= 'Coliseo';

const CONFIRMED = 1;
const PENDING = 2;
const REJECTED = 3;
const PDF = Buffer.from('%PDF-1.4 e2e');

describeIfDb('Certificados (ARK-170, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36);
  const email = (name: string) => `it-ark170-${runId}-${name}@uninorte.edu.co`;

  const users: Record<string, string> = {};
  const teams: Record<string, number> = {};
  const createdUserIds: string[] = [];
  let editionId: number;
  let otherEditionId: number;
  let fairName: string;
  let app: INestApplication;
  let convert: jest.SpyInstance;
  let sendEmail: jest.SpyInstance;

  const as = (sub: string) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
      { expiresIn: 900 },
    )}`,
  });
  const admin = () => as(users.admin);
  const server = () => request(app.getHttpServer() as never);
  const lastHtml = () => convert.mock.calls.at(-1)?.[0] as string;

  async function createUser(key: string, roleName: string) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: email(key),
        roleId: role.id,
        firstName: 'IT',
        lastName: key,
      },
    });
    users[key] = id;
    createdUserIds.push(id);
  }

  async function createTeam(
    key: string,
    options: { edition: number; status: number; isActive?: boolean },
  ) {
    await createUser(key, 'Estudiante');
    const team = await prisma.team.create({
      data: {
        teamName: `<b>${key}</b> ${runId}`,
        userId: users[key],
        editionId: options.edition,
        isActive: options.isActive ?? true,
        teamCode: `N1-${key.slice(0, 3)}-${runId.slice(-5)}`,
        videogame: {
          create: {
            name: `J ${key} ${runId}`.slice(0, 30),
            videogameStatusId: options.status,
          },
        },
        members: {
          create: [
            {
              firstName: 'Activa',
              lastName: key,
              email: email(key),
              studentCode: `it170a${runId}${key}`,
              editionId: options.edition,
            },
            {
              firstName: 'Inactiva',
              lastName: key,
              email: email(`${key}-baja`),
              studentCode: `it170b${runId}${key}`,
              editionId: options.edition,
              isActive: false,
            },
          ],
        },
      },
    });
    teams[key] = team.id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const edition = await prisma.edition.findFirstOrThrow({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    editionId = edition.id;
    fairName = fairNameOf(edition);
    otherEditionId = (
      await prisma.edition.create({
        data: {
          year: 2098,
          semester: 30 + (Date.now() % 7),
          title: `it-ark170-${runId}`,
          startsAt: new Date(Date.UTC(2098, 0, 1)),
          endsAt: new Date(Date.UTC(2098, 0, 31)),
          status: EditionStatus.INACTIVE,
        },
      })
    ).id;

    await createUser('admin', 'Administrador');
    await createUser('student', 'Estudiante');
    await createUser('juror', 'Jurado');
    await createUser('outsider', 'Jurado');
    await prisma.jurorEdition.create({
      data: {
        jurorId: users.juror,
        editionId,
        status: JurorEditionStatus.CONFIRMED,
      },
    });
    await createTeam('confirmed', { edition: editionId, status: CONFIRMED });
    await createTeam('pending', { edition: editionId, status: PENDING });
    await createTeam('rejected', { edition: editionId, status: REJECTED });
    await createTeam('inactive', {
      edition: editionId,
      status: CONFIRMED,
      isActive: false,
    });
    await createTeam('old', { edition: otherEditionId, status: CONFIRMED });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AzureStorageService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    convert = jest
      .spyOn(app.get(CertificatesService), 'convertHtmlToPdf')
      .mockResolvedValue(PDF);
    sendEmail = jest
      .spyOn(app.get(EmailService), 'sendEmail')
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
    await prisma.member.deleteMany({
      where: { teamId: { in: Object.values(teams) } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: Object.values(teams) } },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: createdUserIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.edition.deleteMany({ where: { id: otherEditionId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    convert.mockClear();
    sendEmail.mockClear();
  });

  describe('descarga del equipo', () => {
    it('entrega el PDF de un equipo confirmado con los datos de la edición activa', async () => {
      const res = await server()
        .get(`/certificates/team/${teams.confirmed}?type=2ND_PLACE_CERTIFICATE`)
        .set(admin())
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(
        'certificado-segundo-puesto-',
      );
      const html = lastHtml();
      expect(html).toContain(fairName);
      expect(html).toContain('Activa confirmed');
      expect(html).not.toContain('Inactiva confirmed');
      expect(html).toContain('&lt;b&gt;confirmed&lt;/b&gt;');
      expect(html).not.toContain('<b>confirmed</b>');
      expect(html).not.toContain('28/05/2026');
    });

    it.each([
      ['pending', 400, 'CERTIFICATE_TEAM_NOT_CONFIRMED'],
      ['rejected', 400, 'CERTIFICATE_TEAM_NOT_CONFIRMED'],
      ['inactive', 404, 'CERTIFICATE_TEAM_NOT_FOUND'],
      ['old', 404, 'CERTIFICATE_TEAM_NOT_FOUND'],
    ])('el equipo %s no se certifica', async (key, status, code) => {
      const res = await server()
        .get(`/certificates/team/${teams[key]}`)
        .set(admin())
        .expect(status);
      expect(res.body.code).toBe(code);
      expect(convert).not.toHaveBeenCalled();
    });

    it('rechaza un tipo inválido', async () => {
      await server()
        .get(`/certificates/team/${teams.confirmed}?type=OTRO`)
        .set(admin())
        .expect(400);
    });

    it('solo es para el administrador', async () => {
      await server()
        .get(`/certificates/team/${teams.confirmed}`)
        .set(as(users.student))
        .expect(403);
      await server().get(`/certificates/team/${teams.confirmed}`).expect(401);
    });
  });

  describe('descarga del jurado', () => {
    it('entrega el PDF de un jurado de la edición activa', async () => {
      const res = await server()
        .get(`/certificates/juror/${users.juror}`)
        .set(admin())
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(lastHtml()).toContain(`Participó en la ${fairName} como Jurado`);
    });

    it('un jurado que no participa en la edición no se certifica', async () => {
      const res = await server()
        .get(`/certificates/juror/${users.outsider}`)
        .set(admin())
        .expect(400);
      expect(res.body.message).toContain('no participa');
      expect(convert).not.toHaveBeenCalled();
    });

    it('solo es para el administrador', async () => {
      await server()
        .get(`/certificates/juror/${users.juror}`)
        .set(as(users.juror))
        .expect(403);
    });
  });

  describe('envío por correo', () => {
    const send = (key: string) =>
      server()
        .post('/email/resend-certificate-email')
        .set(admin())
        .send({
          email: email(key),
          typeOfEmail: 'PARTICIPATION_CERTIFICATE',
        });

    it('un equipo confirmado recibe su certificado', async () => {
      await send('confirmed').expect(200);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][0]).toBe(email('confirmed'));
      expect(sendEmail.mock.calls[0][3].email).toBe(email('confirmed'));
    });

    it.each([
      ['pending', 400],
      ['rejected', 400],
      ['old', 404],
    ])('al equipo %s no se le envía nada', async (key, status) => {
      await send(key).expect(status);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(convert).not.toHaveBeenCalled();
    });

    it('el jurado recibe el asunto y el correo con la edición activa', async () => {
      await server()
        .post('/certificates/juror')
        .set(admin())
        .send({ userId: users.juror })
        .expect(201);
      expect(sendEmail.mock.calls[0][1]).toBe(
        `Tu certificado de participación — ${fairName}`,
      );
      expect(sendEmail.mock.calls[0][3]).toMatchObject({ fairName });
    });
  });
});
