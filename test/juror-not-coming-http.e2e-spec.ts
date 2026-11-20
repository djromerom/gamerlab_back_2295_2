import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CheckInMethod,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
  PrismaClient,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { findActiveEdition } from '../src/editions/active-edition';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-44 (ARK-293) por HTTP contra PostgreSQL real, con la aplicación completa (guards y permisos
 * del seed): «No podrá asistir» deja al jurado como ausente confirmado («No vendrán», con sus
 * grupos) y Contingencia lo trata como ausente de inmediato, sin esperar la hora de control y sin
 * quitarle los grupos. «Viene en camino» lo devuelve a la normalidad, y el check-in también.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed (con
 * una edición activa). Pone el cronograma en un día futuro (antes de la hora de control) y el
 * mínimo de evaluaciones en 3; al final deja todo como estaba y borra lo que creó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type AlertJuror = {
  jurorId: string;
  state: string;
  notComing: boolean;
  notComingSince: string | null;
  groups: { teamId: number; teamCode: string; evaluated: boolean }[];
  pendingGroups: number;
};
type Alert = {
  totals: { notComing: number };
  missingJurors: AlertJuror[];
  notComingJurors: AlertJuror[];
};
type Suggestions = {
  base: string;
  grupos: {
    teamId: number;
    faltantes: number;
    jurados: { id: string; noVendra: boolean; cuenta: boolean }[];
    sugeridos: { id: string }[];
    alternativas: { id: string }[];
  }[];
};

describeIfDb(
  '«No podrá asistir» y contingencia (HU-44, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36).slice(-5);
    const ids: Record<string, string> = {};
    let app: INestApplication;
    let editionId: number;
    let teamId: number;
    let savedMinimum: number | null = null;
    let savedSchedule: {
      fairDate: Date;
      startTime: string;
      alertTime: string;
      controlTime: string;
      closeTime: string;
    } | null = null;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);

    async function user(
      key: string,
      role: string,
      enrollment?: { type: JurorType; category: JurorCategory },
    ) {
      const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
      const u = await prisma.user.create({
        data: {
          id: `it-ark293-${runId}-${key}`,
          email: `it-ark293-${runId}-${key}@uninorte.edu.co`,
          roleId: r.id,
          firstName: 'IT',
          lastName: key,
          jurorCategory: enrollment?.category ?? null,
        },
      });
      if (enrollment) {
        await prisma.jurorEdition.create({
          data: {
            jurorId: u.id,
            editionId,
            type: enrollment.type,
            status: JurorEditionStatus.CONFIRMED,
          },
        });
      }
      ids[key] = u.id;
      return u.id;
    }

    const respond = (jurorKey: string, result: string) =>
      server()
        .post('/absent-juror-responses')
        .set(as(ids.admin))
        .send({ jurorId: ids[jurorKey], result });
    const alert = async () =>
      (await server().get('/absence-alert').set(as(ids.admin)).expect(200))
        .body as Alert;
    const groupAtRisk = async () =>
      (
        (
          await server()
            .get('/juror/contingency/suggestions')
            .set(as(ids.admin))
            .expect(200)
        ).body as Suggestions
      ).grupos.find((g) => g.teamId === teamId);

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const active = await findActiveEdition(prisma);
      if (!active)
        throw new Error('La base de prueba necesita una edición activa');
      editionId = active.id;

      savedSchedule = await prisma.fairSchedule.findUnique({
        where: { editionId },
        select: {
          fairDate: true,
          startTime: true,
          alertTime: true,
          controlTime: true,
          closeTime: true,
        },
      });
      const times = {
        fairDate: new Date('2096-03-02T00:00:00.000Z'),
        startTime: '08:00',
        alertTime: '10:00',
        controlTime: '11:00',
        closeTime: '12:00',
      };
      await prisma.fairSchedule.upsert({
        where: { editionId },
        update: times,
        create: { editionId, ...times },
      });
      const config = await prisma.eventConfiguration.findUnique({
        where: { editionId },
        select: { minEvaluationsPerTeam: true },
      });
      savedMinimum = config?.minEvaluationsPerTeam ?? null;
      if (config) {
        await prisma.eventConfiguration.update({
          where: { editionId },
          data: { minEvaluationsPerTeam: 3 },
        });
      }

      await user('admin', 'Administrador');
      const official = {
        type: JurorType.OFFICIAL,
        category: JurorCategory.JUNIOR,
      };
      const backup = { type: JurorType.BACKUP, category: JurorCategory.JUNIOR };
      for (const key of ['ausente', 'b', 'c'])
        await user(key, 'Jurado', official);
      await user('s1', 'Jurado', backup);
      // Suplente que también avisó que no vendrá: no se debe proponer.
      await user('s2', 'Jurado', backup);

      const status = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'CONFIRMADO' },
      });
      teamId = (
        await prisma.team.create({
          data: {
            teamName: `it-ark293-${runId}`,
            teamCode: `N1-IT${runId}`,
            userId: await user('lider', 'Estudiante'),
            editionId,
            videogame: {
              create: {
                name: `it-ark293-${runId}`,
                videogameStatusId: status.id,
              },
            },
            assignedJurors: {
              connect: ['ausente', 'b', 'c'].map((key) => ({ id: ids[key] })),
            },
          },
          select: { id: true },
        })
      ).id;

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
    });

    afterAll(async () => {
      await app?.close();
      const userIds = Object.values(ids);
      if (editionId) {
        if (teamId) await prisma.team.delete({ where: { id: teamId } });
        await prisma.absentJurorResponse.deleteMany({
          where: { jurorId: { in: userIds } },
        });
        await prisma.jurorAttendance.deleteMany({
          where: { jurorId: { in: userIds } },
        });
        await prisma.jurorEdition.deleteMany({
          where: { jurorId: { in: userIds } },
        });
        if (savedSchedule) {
          await prisma.fairSchedule.update({
            where: { editionId },
            data: savedSchedule,
          });
        } else {
          await prisma.fairSchedule.deleteMany({ where: { editionId } });
        }
        if (savedMinimum !== null) {
          await prisma.eventConfiguration.update({
            where: { editionId },
            data: { minEvaluationsPerTeam: savedMinimum },
          });
        }
      }
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });

    it('antes de cualquier respuesta, el grupo no está en riesgo (cuentan los asignados)', async () => {
      expect(await groupAtRisk()).toBeUndefined();
      const { notComingJurors } = await alert();
      expect(notComingJurors.some((j) => j.jurorId === ids.ausente)).toBe(
        false,
      );
    });

    it('«No podrá asistir» lo pasa a «No vendrán» con sus grupos, sin esperar la hora de control', async () => {
      await respond('ausente', 'CANNOT_ATTEND').expect(201);
      await respond('s2', 'CANNOT_ATTEND').expect(201);

      const body = await alert();
      const juror = body.notComingJurors.find((j) => j.jurorId === ids.ausente);
      expect(juror).toMatchObject({
        state: 'ABSENT',
        notComing: true,
        groups: [{ teamId, teamCode: `N1-IT${runId}`, evaluated: false }],
        pendingGroups: 1,
      });
      expect(juror!.notComingSince).not.toBeNull();
      expect(body.totals.notComing).toBeGreaterThanOrEqual(2);
      expect(body.missingJurors.some((j) => j.jurorId === ids.ausente)).toBe(
        false,
      );
    });

    it('Contingencia lo trata como ausente, propone un suplente y no propone al suplente que no vendrá', async () => {
      const group = await groupAtRisk();
      expect(group).toMatchObject({ faltantes: 1 });
      expect(group!.jurados.find((j) => j.id === ids.ausente)).toMatchObject({
        noVendra: true,
        cuenta: false,
      });
      expect(group!.sugeridos).toHaveLength(1);
      const offered = [...group!.sugeridos, ...group!.alternativas].map(
        (s) => s.id,
      );
      expect(offered).toContain(ids.s1);
      expect(offered).not.toContain(ids.s2);

      // Sus grupos no se borran.
      const team = await prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { assignedJurors: { select: { id: true } } },
      });
      expect(team.assignedJurors.map((j) => j.id)).toContain(ids.ausente);
    });

    it('«Viene en camino» después lo devuelve a la normalidad', async () => {
      await respond('ausente', 'ON_THE_WAY').expect(201);
      expect(
        (await alert()).notComingJurors.some((j) => j.jurorId === ids.ausente),
      ).toBe(false);
      expect(await groupAtRisk()).toBeUndefined();
    });

    it('si llega y hace check-in, la respuesta queda sin efecto y el historial se conserva', async () => {
      await respond('ausente', 'CANNOT_ATTEND').expect(201);
      expect((await groupAtRisk())?.faltantes).toBe(1);

      await prisma.jurorAttendance.create({
        data: {
          jurorId: ids.ausente,
          editionId,
          checkedInById: ids.admin,
          method: CheckInMethod.MANUAL,
        },
      });
      const body = await alert();
      expect(body.notComingJurors.some((j) => j.jurorId === ids.ausente)).toBe(
        false,
      );
      expect(await groupAtRisk()).toBeUndefined();

      const history = await server()
        .get(`/absent-juror-responses/${ids.ausente}`)
        .set(as(ids.admin))
        .expect(200);
      expect(
        (history.body as { data: { result: string }[] }).data.map(
          (r) => r.result,
        ),
      ).toEqual(['CANNOT_ATTEND', 'ON_THE_WAY', 'CANNOT_ATTEND']);
      // Ya llegó: no se registran más respuestas (409, HU-13).
      await respond('ausente', 'CANNOT_ATTEND').expect(409);
    });
  },
);
