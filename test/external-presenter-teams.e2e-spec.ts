import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CertificatesService } from '../src/certificates/certificates.service';
import { EmailService } from '../src/email/email.service';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * ARK-257 (BG-57): por HTTP contra PostgreSQL real, con la aplicación completa (guards, permisos
 * del seed y ValidationPipe):
 * - un equipo no calificable no recibe el código (ni el estudiante ni el administrador);
 * - solo se marcan equipos Confirmados (400 TEAM_NOT_CONFIRMED), y desmarcar siempre se permite;
 * - el nombre de un presentador externo acepta números (QA Presentador 2).
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Solo se simulan el correo (ACS) y el PDF (Gotenberg). Crea sus datos y los borra al final.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

const CODE = 'K7M2QX';

describeIfDb(
  'Equipos presentadores externos (ARK-257, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const adminId = `it-ark257-${runId}-admin`;
    const leaderId = `it-ark257-${runId}-lider`;
    const presenterEmail = `ark257-${runId}@empresa.test`;

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
    let teamId: number;
    let videogameId: number;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const setStatus = async (status: string) => {
      const row = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status },
      });
      await prisma.videogame.update({
        where: { id: videogameId },
        data: { videogameStatusId: row.id },
      });
    };
    const patchGradable = (notGradable: boolean) =>
      server()
        .patch(`/teams/${teamId}/gradable`)
        .set(as(adminId))
        .send({ notGradable });
    const myCode = () =>
      server().get('/team-verification/my-code').set(as(leaderId));
    const storedCode = async () =>
      (
        await prisma.team.findUniqueOrThrow({
          where: { id: teamId },
          select: { verificationCode: true },
        })
      ).verificationCode;

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const edition = await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      });
      for (const [id, roleName] of [
        [adminId, 'Administrador'],
        [leaderId, 'Estudiante'],
      ]) {
        const role = await prisma.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await prisma.user.create({
          data: {
            id,
            email: `${id}@uninorte.edu.co`,
            roleId: role.id,
            firstName: 'IT',
            lastName: 'ARK257',
          },
        });
      }
      const pending = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'PENDIENTE' },
      });
      const team = await prisma.team.create({
        data: {
          teamName: `it-ark257-${runId}`,
          userId: leaderId,
          editionId: edition.id,
          teamCode: `N1-Q-${runId.slice(-5)}`,
          verificationCode: CODE,
          videogame: {
            create: {
              name: `it-ark257-${runId}`.slice(0, 30),
              videogameStatusId: pending.id,
            },
          },
        },
        include: { videogame: true },
      });
      teamId = team.id;
      videogameId = team.videogame!.id;

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AzureStorageService)
        .useValue({})
        .overrideProvider(EmailService)
        .useValue(
          new Proxy(
            {
              sendEmail: jest.fn().mockResolvedValue(undefined),
              resendAuthEmailOfType: jest
                .fn()
                .mockResolvedValue({ message: 'ok' }),
            },
            stubRest,
          ),
        )
        .overrideProvider(CertificatesService)
        .useValue(new Proxy({}, stubRest))
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
        where: { email: presenterEmail },
        select: { id: true },
      });
      const ids = [adminId, leaderId, ...presenters.map((p) => p.id)];
      await prisma.externalPresenter.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.teamVerificationLog.deleteMany({ where: { teamId } });
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { actorUserId: adminId },
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
    it('un equipo normal ve su código en el panel', async () => {
      const res = await myCode().expect(200);
      expect(res.body).toEqual({
        teamId,
        teamCode: expect.any(String) as string,
        verificationCode: CODE,
        notGradable: false,
      });
    });

    it.each(['PENDIENTE', 'RECHAZADO'])(
      'no se puede marcar un equipo %s (400 TEAM_NOT_CONFIRMED) y no cambia nada',
      async (status) => {
        await setStatus(status);
        const res = await patchGradable(true).expect(400);
        expect(res.body).toMatchObject({
          statusCode: 400,
          code: 'TEAM_NOT_CONFIRMED',
          message: expect.stringContaining(status) as string,
        });
        const team = await prisma.team.findUniqueOrThrow({
          where: { id: teamId },
        });
        expect(team.notGradable).toBe(false);
      },
    );

    it('un equipo Confirmado se marca', async () => {
      await setStatus('CONFIRMADO');
      const res = await patchGradable(true).expect(200);
      expect(res.body).toMatchObject({ id: teamId, notGradable: true });
    });

    it('marcado, el estudiante no recibe el código y se le avisa con notGradable', async () => {
      const res = await myCode().expect(200);
      expect(res.body).toEqual({
        teamId,
        teamCode: expect.any(String) as string,
        verificationCode: null,
        notGradable: true,
      });
      expect(JSON.stringify(res.body)).not.toContain(CODE);
    });

    it('marcado, el administrador no puede consultar ni regenerar el código (400)', async () => {
      const view = await server()
        .get(`/team-verification/${teamId}`)
        .set(as(adminId))
        .expect(400);
      expect(view.body).toMatchObject({ code: 'TEAM_NOT_GRADABLE' });
      expect(JSON.stringify(view.body)).not.toContain(CODE);

      await server()
        .post(`/team-verification/${teamId}/regenerate`)
        .set(as(adminId))
        .expect(400);
      expect(await storedCode()).toBe(CODE);
      expect(
        await prisma.teamVerificationLog.count({ where: { teamId } }),
      ).toBe(0);
    });

    it('desmarcar siempre se permite, aunque el equipo se haya rechazado; vuelve el código', async () => {
      await setStatus('RECHAZADO');
      await patchGradable(false).expect(200);
      const res = await myCode().expect(200);
      expect(res.body).toMatchObject({
        verificationCode: CODE,
        notGradable: false,
      });
      await server()
        .get(`/team-verification/${teamId}`)
        .set(as(adminId))
        .expect(200)
        .expect({ teamId, code: CODE });
    });

    it('se registra a QA Presentador 2 (el nombre acepta números)', async () => {
      const res = await server()
        .post('/external-presenters')
        .set(as(adminId))
        .send({
          email: presenterEmail,
          confirmEmail: presenterEmail,
          firstName: 'QA',
          lastName: 'Presentador 2',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        email: presenterEmail,
        firstName: 'QA',
        lastName: 'Presentador 2',
      });
    });

    it('un nombre con símbolos sigue dando 400', async () => {
      const res = await server()
        .post('/external-presenters')
        .set(as(adminId))
        .send({
          email: `otro-${presenterEmail}`,
          confirmEmail: `otro-${presenterEmail}`,
          firstName: 'QA <b>',
          lastName: 'Presentador',
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('letras, números y espacios');
    });
  },
);
