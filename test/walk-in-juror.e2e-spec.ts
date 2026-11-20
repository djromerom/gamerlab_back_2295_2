import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
  PrismaClient,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-24 (ARK-217): alta del jurado de último momento por HTTP contra PostgreSQL real, con la
 * aplicación completa (guards, permisos del seed, ValidationPipe y el `AuthService` real que crea
 * la cuenta y su enlace). Recorre el CU-24 hasta la llegada: alta nueva, correo repetido (A1),
 * nombres parecidos (A2) y que solo el Administrador puede hacerlo.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Sin credenciales de ACS el correo no sale (modo simulación): el alta no depende de él.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

describeIfDb(
  'Alta de jurado de último momento (HU-24, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    // Los nombres solo aceptan letras: el sufijo de la corrida va sin dígitos.
    const letters = runId.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);
    const lastName = `Prueba${letters}`;
    const domain = `hu24-${runId}.test`;
    const userId = (name: string) => `it-ark217-${runId}-${name}`;
    const [adminId, staffId, jurorId, enrolledId] = [
      'admin',
      'staff',
      'juror',
      'enrolled',
    ].map(userId);
    const fixtures = [adminId, staffId, jurorId, enrolledId];

    let app: INestApplication;
    let editionId: number;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const create = (body: Record<string, unknown>, sub = adminId) =>
      server().post('/walk-in-jurors').set(as(sub)).send(body);
    const laura = {
      firstName: 'Laura',
      lastName,
      email: `Laura@${domain}`,
    };

    const createUser = async (
      id: string,
      roleName: string,
      names: { firstName: string; lastName: string },
    ) => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await prisma.user.create({
        data: {
          id,
          email: `${id}@uninorte.edu.co`,
          roleId: role.id,
          ...names,
          jurorCategory: roleName === 'Jurado' ? JurorCategory.JUNIOR : null,
        },
      });
    };
    const createdUsers = () =>
      prisma.user.findMany({
        where: { email: { endsWith: `@${domain}` } },
        include: {
          role: true,
          jurorEditions: true,
          attendances: true,
        },
        orderBy: { email: 'asc' },
      });

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const edition = await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      });
      editionId = edition.id;

      await createUser(adminId, 'Administrador', {
        firstName: 'Admin',
        lastName: `Mesa${letters}`,
      });
      await createUser(staffId, 'Staff', {
        firstName: 'Staff',
        lastName: `Mesa${letters}`,
      });
      // Jurado con cuenta pero fuera de la edición, y jurado oficial confirmado que no ha llegado.
      await createUser(jurorId, 'Jurado', {
        firstName: 'Pedro',
        lastName: `Fuera${letters}`,
      });
      await createUser(enrolledId, 'Jurado', {
        firstName: 'Carlos Andrés',
        lastName: `Registrado${letters}`,
      });
      await prisma.jurorEdition.create({
        data: {
          jurorId: enrolledId,
          editionId,
          status: JurorEditionStatus.CONFIRMED,
          type: JurorType.OFFICIAL,
        },
      });

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
      const ids = [...fixtures, ...(await createdUsers()).map((u) => u.id)];
      await prisma.verificationToken.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.jurorAttendance.deleteMany({
        where: { jurorId: { in: ids } },
      });
      await prisma.jurorEdition.deleteMany({ where: { jurorId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });

    it('solo el Administrador: sin sesión 401; Staff y Jurado 403, y no se crea nada', async () => {
      await server().post('/walk-in-jurors').send(laura).expect(401);
      await create(laura, staffId).expect(403);
      await create(laura, jurorId).expect(403);

      expect(await createdUsers()).toEqual([]);
    });

    it('datos inválidos: 400 con el mensaje en español', async () => {
      const res = await create({ ...laura, firstName: 'Laura2', email: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'El nombre solo puede contener letras y espacios',
          'El correo electrónico no es válido',
        ]),
      );
    });

    it('alta nueva: Junior y Suplente aunque se pida otra cosa, Confirmado, con llegada y enlace de cuenta', async () => {
      const res = await create({
        ...laura,
        jurorCategory: 'SENIOR',
        jurorType: 'OFFICIAL',
      }).expect(201);

      expect(res.body).toEqual({
        juror: {
          id: expect.any(String),
          name: `Laura ${lastName}`,
          email: `laura@${domain}`,
          category: 'JUNIOR',
          type: 'BACKUP',
        },
        edition: { id: editionId, title: expect.any(String) },
        attendance: { checkedInAt: expect.any(String), method: 'MANUAL' },
        walkIn: true,
      });

      const [user] = await createdUsers();
      expect(user).toMatchObject({
        id: res.body.juror.id,
        isActive: true,
        jurorCategory: 'JUNIOR',
        jurorType: 'BACKUP',
        role: { name: 'Jurado' },
      });
      expect(user.jurorEditions).toEqual([
        expect.objectContaining({
          editionId,
          status: 'CONFIRMED',
          type: 'BACKUP',
          walkIn: true,
          updatedById: adminId,
        }),
      ]);
      expect(user.attendances).toEqual([
        expect.objectContaining({
          editionId,
          method: 'MANUAL',
          checkedInById: adminId,
          badgeId: null,
        }),
      ]);
      // El enlace para crear la contraseña existe: el reenvío de Personal → Jurados funciona.
      expect(
        await prisma.verificationToken.count({ where: { userId: user.id } }),
      ).toBe(1);
    });

    it('queda en las listas de la edición: Jurados de la edición (walkIn) y asistencia (Presente)', async () => {
      const list = await server()
        .get('/juror-edition')
        .query({ search: lastName })
        .set(as(adminId))
        .expect(200);
      expect(list.body.data).toEqual([
        expect.objectContaining({
          firstName: 'Laura',
          status: 'CONFIRMED',
          type: 'BACKUP',
          category: 'Junior',
          walkIn: true,
        }),
      ]);

      const search = await server()
        .get('/juror-checkin/search')
        .query({ q: lastName })
        .set(as(staffId))
        .expect(200);
      expect(search.body).toEqual([
        expect.objectContaining({
          name: `Laura ${lastName}`,
          hasBadge: false,
          checkedInAt: expect.any(String),
        }),
      ]);
    });

    it('A1 · mismo correo: 409 EMAIL_ALREADY_EXISTS con la persona y su llegada; no crea otra cuenta', async () => {
      const res = await create({
        firstName: 'Otra',
        lastName: 'Persona',
        email: `LAURA@${domain}`,
        confirmSimilar: true,
      }).expect(409);

      expect(res.body).toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
        existing: {
          name: `Laura ${lastName}`,
          role: 'Jurado',
          isJurorOfEdition: true,
          editionStatus: 'CONFIRMED',
          checkedInAt: expect.any(String),
        },
      });
      expect(JSON.stringify(res.body.existing)).not.toContain('@');
      expect(await createdUsers()).toHaveLength(1);
    });

    it('A1 · jurado ya registrado que no ha llegado: 409, conserva su tipo y se le marca la llegada', async () => {
      const res = await create({
        firstName: 'Carlos',
        lastName: 'Otro',
        email: `${enrolledId}@uninorte.edu.co`,
      }).expect(409);

      expect(res.body).toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
        message: expect.stringContaining('marca su llegada'),
        existing: {
          id: enrolledId,
          isJurorOfEdition: true,
          editionStatus: 'CONFIRMED',
          checkedInAt: null,
        },
      });

      // Lo que la pantalla ofrece: la llegada manual de HU-11 con el id devuelto.
      const checkIn = await server()
        .post('/juror-checkin/manual')
        .set(as(adminId))
        .send({ jurorId: res.body.existing.id })
        .expect(201);
      expect(checkIn.body).toMatchObject({
        status: 'CHECKED_IN',
        method: 'MANUAL',
      });

      // No pasó a suplente ni quedó marcado como alta del día.
      expect(
        await prisma.jurorEdition.findUniqueOrThrow({
          where: { jurorId_editionId: { jurorId: enrolledId, editionId } },
        }),
      ).toMatchObject({ type: 'OFFICIAL', walkIn: false });
    });

    it('A1 · cuenta de jurado que no es de la edición: 409 y no la inscribe', async () => {
      const res = await create({
        firstName: 'Pedro',
        lastName: 'Otro',
        email: `${jurorId}@uninorte.edu.co`,
      }).expect(409);

      expect(res.body).toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
        message: expect.stringContaining('Jurados de la edición'),
        existing: {
          id: jurorId,
          isJurorOfEdition: false,
          editionStatus: null,
        },
      });
      expect(await prisma.jurorEdition.count({ where: { jurorId } })).toBe(0);
    });

    it('A2 · nombre parecido sin tildes ni mayúsculas: 409 SIMILAR_PEOPLE; con confirmSimilar se crea', async () => {
      const body = {
        firstName: 'carlos',
        lastName: `REGISTRADO${letters.toUpperCase()}`,
        email: `carlos@${domain}`,
      };

      const res = await create(body).expect(409);
      expect(res.body).toMatchObject({
        code: 'SIMILAR_PEOPLE',
        matches: [
          {
            id: enrolledId,
            name: `Carlos Andrés Registrado${letters}`,
            role: 'Jurado',
            isJurorOfEdition: true,
          },
        ],
      });
      expect(await createdUsers()).toHaveLength(1);

      await create({ ...body, confirmSimilar: true }).expect(201);
      expect((await createdUsers()).map((u) => u.email)).toEqual([
        `carlos@${domain}`,
        `laura@${domain}`,
      ]);
    });
  },
);
