import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CertificatesService } from '../src/certificates/certificates.service';
import { EmailService } from '../src/email/email.service';
import { jurorsOfEdition } from '../src/juror-edition/jurors-of-edition';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-33 (ARK-194): presentadores externos por HTTP contra PostgreSQL real, con la aplicación
 * completa (guards, permisos del seed y ValidationPipe). Solo se simulan el envío de correos y la
 * generación del PDF (Gotenberg); todo lo demás es real.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * No cambia «evaluaciones abiertas» ni la edición activa (las e2e corren en paralelo).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type Row = {
  id: number;
  userId: string;
  email: string;
  certificateSentAt: string | null;
};

describeIfDb('Presentadores externos (HU-33, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36);
  const userId = (name: string) => `it-ark194-${runId}-${name}`;
  const roleUsers: Record<string, string> = {
    Administrador: userId('admin'),
    Estudiante: userId('estudiante'),
    Profesor: userId('profesor'),
    Jurado: userId('jurado'),
    Staff: userId('staff'),
  };
  const presenterEmail = `ext-${runId}@empresa.test`;
  const secondEmail = `ext2-${runId}@empresa.test`;
  const createdUserIds: string[] = Object.values(roleUsers);

  const sendEmail = jest.fn().mockResolvedValue(undefined);
  const generatePdf = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 e2e'));

  // Cualquier otro método del servicio simulado es un jest.fn(); `then` no, para que Nest no lo
  // tome por una promesa al registrar el provider.
  const stubRest: ProxyHandler<Record<string, unknown>> = {
    get: (target, prop) =>
      prop in target
        ? target[prop as string]
        : prop === 'then'
          ? undefined
          : jest.fn(),
  };

  let app: INestApplication;
  let editionId: number;
  let teamId: number;
  let presenter: Row;

  const as = (sub: string) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
      { expiresIn: 900 },
    )}`,
  });
  const admin = () => as(roleUsers.Administrador);
  const server = () => request(app.getHttpServer() as never);
  const body = (email: string, extra: object = {}) => ({
    email,
    confirmEmail: email,
    firstName: 'Ana',
    lastName: 'Externa',
    organization: 'Estudio Indie Caribe',
    presentationTitle: 'Diseño de niveles',
    ...extra,
  });
  const binary = (res: request.Test) =>
    res.buffer(true).parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    editionId = (
      await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      })
    ).id;
    for (const [roleName, id] of Object.entries(roleUsers)) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await prisma.user.create({
        data: {
          id,
          email: `${id}@uninorte.edu.co`,
          roleId: role.id,
          firstName: 'IT',
          lastName: 'ARK194',
        },
      });
    }
    const team = await prisma.team.create({
      data: {
        teamName: `it-ark194-${runId}`,
        userId: roleUsers.Estudiante,
        editionId,
        teamCode: `N1-X-${runId.slice(-5)}`,
        videogame: {
          create: {
            name: `it-ark194-${runId}`.slice(0, 30),
            videogameStatusId: 1,
          },
        },
      },
    });
    teamId = team.id;

    // Solo se simulan los servicios externos: correo (ACS) y PDF (Gotenberg).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AzureStorageService)
      .useValue({})
      .overrideProvider(EmailService)
      .useValue(
        new Proxy(
          {
            sendEmail,
            resendAuthEmailOfType: jest
              .fn()
              .mockResolvedValue({ message: 'ok' }),
          },
          stubRest,
        ),
      )
      .overrideProvider(CertificatesService)
      .useValue(
        new Proxy(
          { generateExternalPresenterCertificatePdf: generatePdf },
          stubRest,
        ),
      )
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
  });

  afterAll(async () => {
    await app?.close();
    const presenters = await prisma.user.findMany({
      where: { email: { in: [presenterEmail, secondEmail] } },
      select: { id: true },
    });
    const ids = [...createdUserIds, ...presenters.map((p) => p.id)];
    await prisma.externalPresenter.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.jurorAssignmentAuditLog.deleteMany({
      where: { actorUserId: roleUsers.Administrador },
    });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.verificationToken.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  // Un solo recorrido: cada paso depende del anterior.
  it.each(['Estudiante', 'Profesor', 'Jurado', 'Staff'])(
    '%s no puede crear presentadores por la API (403)',
    async (roleName) => {
      await server()
        .post('/external-presenters')
        .set(as(roleUsers[roleName]))
        .send(body(presenterEmail))
        .expect(403);
      await server()
        .get('/external-presenters')
        .set(as(roleUsers[roleName]))
        .expect(403);
    },
  );

  it('el administrador lo registra: cuenta con el rol y fila en la edición activa', async () => {
    const res = await server()
      .post('/external-presenters')
      .set(admin())
      .send(body(presenterEmail))
      .expect(201);
    presenter = res.body as Row;
    expect(res.body).toMatchObject({
      email: presenterEmail,
      firstName: 'Ana',
      organization: 'Estudio Indie Caribe',
      editionId,
      certificateSentAt: null,
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: presenter.userId },
      include: { role: true },
    });
    expect(user.role.name).toBe('Presentador externo');
    createdUserIds.push(user.id);
  });

  it('valida el correo repetido (HU-32) y no duplica', async () => {
    const mismatch = await server()
      .post('/external-presenters')
      .set(admin())
      .send(body(secondEmail, { confirmEmail: 'otro@empresa.test' }))
      .expect(400);
    expect(mismatch.body.code).toBe('EMAIL_CONFIRMATION_MISMATCH');
    const again = await server()
      .post('/external-presenters')
      .set(admin())
      .send(body(presenterEmail))
      .expect(409);
    expect(again.body.code).toBe('EXTERNAL_PRESENTER_ALREADY_REGISTERED');
    const otherRole = await server()
      .post('/external-presenters')
      .set(admin())
      .send(body(`${roleUsers.Jurado}@uninorte.edu.co`))
      .expect(409);
    expect(otherRole.body.code).toBe('EMAIL_IN_USE_BY_OTHER_ROLE');
  });

  it('carga por lote: registra los válidos e informa el resto por fila', async () => {
    const res = await server()
      .post('/external-presenters/bulk')
      .set(admin())
      .send({ presenters: [body(secondEmail), body(presenterEmail)] })
      .expect(201);
    expect(res.body.successful).toHaveLength(1);
    expect(res.body.failed).toEqual([
      expect.objectContaining({
        email: presenterEmail,
        code: 'EXTERNAL_PRESENTER_ALREADY_REGISTERED',
      }),
    ]);
  });

  it('el presentador ve su registro y nada más', async () => {
    const me = await server()
      .get('/external-presenters/me')
      .set(as(presenter.userId))
      .expect(200);
    expect(me.body).toMatchObject({
      email: presenterEmail,
      edition: { id: editionId },
    });
    await server().get('/auth/me').set(as(presenter.userId)).expect(200);
    for (const path of [
      '/external-presenters',
      '/juror',
      '/students',
      '/pending-games',
      '/teams/incomplete-jurors',
      '/juror/evaluation-tracking',
    ]) {
      await server().get(path).set(as(presenter.userId)).expect(403);
    }
    await server()
      .post('/evaluation/with-details')
      .set(as(presenter.userId))
      .send({ videogameId: 1, details: [] })
      .expect(403);
    await server()
      .get('/external-presenters/me')
      .set(as(roleUsers.Staff))
      .expect(403);
  });

  it('no es jurado de la edición: no aparece en jurados, seguimiento ni asignación automática', async () => {
    expect(
      await prisma.user.count({
        where: jurorsOfEdition(editionId, [presenter.userId]),
      }),
    ).toBe(0);
    const jurors = await server()
      .get('/juror?limit=100&page=1&participating=true')
      .set(admin())
      .expect(200);
    expect(JSON.stringify(jurors.body)).not.toContain(presenter.userId);
    const tracking = await server()
      .get('/juror/evaluation-tracking')
      .set(admin())
      .expect(200);
    expect(JSON.stringify(tracking.body)).not.toContain(presenter.userId);
    const preview = await server()
      .post('/juror/automatic-assignment/preview')
      .set(admin())
      .send({});
    expect(JSON.stringify(preview.body)).not.toContain(presenter.userId);
  });

  it('no se le puede asignar un equipo a mano', async () => {
    const res = await server()
      .post('/juror/assignments')
      .set(admin())
      .send({ jurorId: presenter.userId, teamId, confirmWarnings: true });
    expect([400, 403, 409]).toContain(res.status);
    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: { assignedJurors: { select: { id: true } } },
    });
    expect(team.assignedJurors).toEqual([]);
  });

  it('no tiene equipo: no puede estar en el ranking ni en las exportaciones de notas', async () => {
    expect(
      await prisma.team.count({ where: { userId: presenter.userId } }),
    ).toBe(0);
    expect(
      await prisma.member.count({ where: { email: presenterEmail } }),
    ).toBe(0);
    const res = await binary(
      server().get('/reports/exportJurados').set(admin()),
    ).expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    const cells: unknown[] = [];
    workbook.worksheets.forEach((ws) =>
      ws.eachRow((row) => cells.push(...(row.values as unknown[]))),
    );
    expect(cells).not.toContain(presenterEmail);
  });

  it('el administrador lo edita y envía su certificado por correo', async () => {
    await server()
      .patch(`/external-presenters/${presenter.id}`)
      .set(admin())
      .send({ presentationTitle: 'Narrativa en juegos', organization: null })
      .expect(200);
    const res = await server()
      .post(`/external-presenters/${presenter.id}/certificate`)
      .set(admin())
      .expect(200);
    expect(res.body.certificateSentAt).toBeTruthy();
    expect(generatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        presenterName: 'Ana Externa',
        organization: null,
        presentationTitle: 'Narrativa en juegos',
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      presenterEmail,
      expect.stringContaining('certificado'),
      'external_presenter_certificate',
      expect.objectContaining({ presenterName: 'Ana Externa' }),
      [
        expect.objectContaining({
          name: 'certificado-presentador-externo.pdf',
          contentType: 'application/pdf',
        }),
      ],
    );
  });

  it('lista y Excel de la edición', async () => {
    const list = await server()
      .get('/external-presenters')
      .set(admin())
      .expect(200);
    const emails = (list.body.presenters as Row[]).map((p) => p.email);
    expect(emails).toEqual(
      expect.arrayContaining([presenterEmail, secondEmail]),
    );
    const res = await binary(
      server().get('/external-presenters/export').set(admin()),
    ).expect(200);
    expect(res.headers['content-disposition']).toMatch(
      /presentadores_externos_/,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    const values: unknown[] = [];
    workbook
      .getWorksheet('Presentadores externos')!
      .eachRow((row) => values.push(row.getCell(3).value));
    expect(values).toEqual(
      expect.arrayContaining([presenterEmail, secondEmail]),
    );
  });

  it('al quitarlo de la edición pierde su registro, pero la cuenta se conserva', async () => {
    await server()
      .delete(`/external-presenters/${presenter.id}`)
      .set(admin())
      .expect(200);
    await server()
      .get('/external-presenters/me')
      .set(as(presenter.userId))
      .expect(404);
    await server()
      .post(`/external-presenters/${presenter.id}/certificate`)
      .set(admin())
      .expect(404);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: presenter.userId } }))
        .isActive,
    ).toBe(true);
    // Puede volver a registrarse en la edición (reactiva la misma fila)
    await server()
      .post('/external-presenters')
      .set(admin())
      .send(body(presenterEmail))
      .expect(201);
  });
});
