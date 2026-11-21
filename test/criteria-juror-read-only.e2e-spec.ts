import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-53 (ARK-324): el jurado y el profesor consultan las rúbricas (criterios de calificación) en solo lectura,
 * por HTTP contra PostgreSQL real con la aplicación completa (guards globales y ValidationPipe):
 * lee la lista y el detalle, cada escritura le responde 403 sin cambiar la base, y el
 * Administrador sigue creando, editando, eliminando y restaurando igual que antes.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Trabaja sobre un criterio propio, inactivo, para no cambiar los pesos que usan otras pruebas,
 * y borra lo que creó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type CriterionBody = {
  id: number;
  name: string;
  description: string | null;
  weight: number | null;
  isActive: boolean;
};
type ListBody = {
  data: CriterionBody[];
  metadata: { totalItems: number; totalWeight: number };
};

describeIfDb(
  'Rúbricas en solo lectura para el jurado (HU-53, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36).slice(-5);
    const name = `e2e-ark324-${runId}`;
    const userIds: string[] = [];
    const criterionIds: number[] = [];
    let app: INestApplication;
    let adminId: string;
    let jurorId: string;
    let professorId: string;
    let criterionId: number;

    const server = () => request(app.getHttpServer() as never);
    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const user = async (suffix: string, role: string) => {
      const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
      const u = await prisma.user.create({
        data: {
          id: `it-ark324-${runId}-${suffix}`,
          email: `it-ark324-${runId}-${suffix}@uninorte.edu.co`,
          roleId: r.id,
          firstName: 'IT',
          lastName: suffix,
        },
      });
      userIds.push(u.id);
      return u.id;
    };
    const snapshot = (id: number) =>
      prisma.criterion.findUniqueOrThrow({
        where: { id },
        select: { name: true, description: true, weight: true, isActive: true },
      });

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
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

      adminId = await user('admin', 'Administrador');
      jurorId = await user('juror', 'Jurado');
      professorId = await user('prof', 'Profesor');
      const created = await prisma.criterion.create({
        data: {
          name,
          description: 'Rúbrica de prueba',
          weight: 0,
          isActive: false,
        },
      });
      criterionId = created.id;
      criterionIds.push(created.id);
    });

    afterAll(async () => {
      await app?.close();
      await prisma.criterion.deleteMany({
        where: { OR: [{ id: { in: criterionIds } }, { name }] },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });

    it('sin sesión, la lista de criterios responde 401', async () => {
      await server().get('/criteria').expect(401);
    });

    it('el jurado lee la lista de criterios activos con nombre, descripción y peso', async () => {
      const res = await server()
        .get('/criteria')
        .query({ page: 1, limit: 100 })
        .set(as(jurorId))
        .expect(200);
      const body = res.body as ListBody;

      const active = await prisma.criterion.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      expect(body.metadata.totalItems).toBe(active.length);
      expect(body.data.map((c) => c.id).sort((a, b) => a - b)).toEqual(
        active.map((c) => c.id).sort((a, b) => a - b),
      );
      expect(body.data.every((c) => c.isActive)).toBe(true);
      for (const c of body.data) {
        expect(c).toEqual(
          expect.objectContaining({
            name: expect.any(String) as string,
            isActive: true,
          }),
        );
        expect(c).toHaveProperty('description');
        expect(c).toHaveProperty('weight');
      }
      expect(body.data.some((c) => c.id === criterionId)).toBe(false);
    });

    it('el jurado lee el detalle de un criterio', async () => {
      const res = await server()
        .get(`/criteria/${criterionId}`)
        .set(as(jurorId))
        .expect(200);
      expect(res.body as CriterionBody).toMatchObject({
        id: criterionId,
        name,
        description: 'Rúbrica de prueba',
        weight: 0,
      });
    });

    it.each([
      ['POST /criteria', () => server().post('/criteria')],
      ['PATCH /criteria/:id', () => server().patch(`/criteria/${criterionId}`)],
      [
        'DELETE /criteria/:id',
        () => server().delete(`/criteria/${criterionId}`),
      ],
      [
        'PATCH /criteria/:id/restore',
        () => server().patch(`/criteria/${criterionId}/restore`),
      ],
    ])(
      'el jurado recibe 403 en %s y la base no cambia',
      async (_route, call) => {
        const before = await snapshot(criterionId);
        const totalBefore = await prisma.criterion.count();

        await call()
          .set(as(jurorId))
          .send({ name: `${name}-x`, description: 'cambio', weight: 0.5 })
          .expect(403);

        expect(await snapshot(criterionId)).toEqual(before);
        expect(await prisma.criterion.count()).toBe(totalBefore);
      },
    );

    it('el profesor también lee las rúbricas y recibe 403 al escribirlas', async () => {
      const prof = as(professorId);
      await server().get('/criteria').set(prof).expect(200);
      await server().get(`/criteria/${criterionId}`).set(prof).expect(200);
      const before = await snapshot(criterionId);
      await server()
        .post('/criteria')
        .set(prof)
        .send({ name: `${name}-p`, description: 'x', weight: 0 })
        .expect(403);
      await server()
        .patch(`/criteria/${criterionId}`)
        .set(prof)
        .send({ description: 'cambio' })
        .expect(403);
      await server().delete(`/criteria/${criterionId}`).set(prof).expect(403);
      await server()
        .patch(`/criteria/${criterionId}/restore`)
        .set(prof)
        .expect(403);
      expect(await snapshot(criterionId)).toEqual(before);
      expect(
        await prisma.criterion.count({ where: { name: `${name}-p` } }),
      ).toBe(0);
    });

    it('el Administrador sigue creando, editando, eliminando y restaurando', async () => {
      const admin = as(adminId);

      const created = await server()
        .post('/criteria')
        .set(admin)
        .send({ name: `${name}-n`, description: 'Nueva', weight: 0 })
        .expect(201);
      const newId = (created.body as CriterionBody).id;
      criterionIds.push(newId);
      // Se deja inactivo enseguida para no cambiar la suma de pesos de las otras pruebas.
      await server().delete(`/criteria/${newId}`).set(admin).expect(200);

      await server()
        .patch(`/criteria/${criterionId}`)
        .set(admin)
        .send({ description: 'Editada por el admin' })
        .expect(200);
      await server()
        .patch(`/criteria/${criterionId}/restore`)
        .set(admin)
        .expect(200);
      expect((await snapshot(criterionId)).isActive).toBe(true);
      await server().delete(`/criteria/${criterionId}`).set(admin).expect(200);

      expect(await snapshot(criterionId)).toMatchObject({
        description: 'Editada por el admin',
        isActive: false,
      });
      expect((await snapshot(newId)).isActive).toBe(false);
    });
  },
);
