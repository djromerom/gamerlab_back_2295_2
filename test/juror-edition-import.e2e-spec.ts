import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CertificatesService } from '../src/certificates/certificates.service';
import { EmailService } from '../src/email/email.service';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-49 (ARK-280): importar jurados desde un Excel, por HTTP contra PostgreSQL real con la
 * aplicación completa (guards, permisos del seed, multer y cola de correos):
 * - cuentas nuevas (Junior, con el tipo), confirmadas en la edición activa y con correo en cola;
 * - cuentas existentes: confirmadas, «ya estaba», sin verificar (reenvía) y de otro rol (error);
 * - filas inválidas en el informe sin frenar a las demás;
 * - volver a importar el mismo archivo no duplica;
 * - solo el Administrador; archivo que no es xlsx → 400.
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
// Pausa corta entre correos para que la prueba no espere 2,5 s por cada uno.
process.env.JUROR_IMPORT_EMAIL_DELAY_MS = '20';

interface ImportBody {
  edition: { id: number };
  summary: Record<string, number>;
  rows: { row: number }[];
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describeIfDb(
  'Importar jurados de la edición (ARK-280, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const id = (key: string) => `it-ark280-${runId}-${key}`;
    const mail = (key: string) => `ark280-${runId}-${key}@empresa.test`;

    const adminId = id('admin');
    const studentId = id('estudiante');
    const emailCalls: string[] = [];

    let app: INestApplication;
    let editionId: number;
    const createdUserIds: string[] = [];

    const stubRest: ProxyHandler<Record<string, unknown>> = {
      get: (target, prop) =>
        prop in target
          ? target[prop as string]
          : prop === 'then'
            ? undefined
            : jest.fn(),
    };

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);

    const workbook = async (rows: unknown[][]): Promise<Buffer> => {
      const book = new ExcelJS.Workbook();
      book
        .addWorksheet('Jurados')
        .addRows([['Nombres', 'Apellidos', 'Correo', 'Tipo'], ...rows]);
      return Buffer.from(await book.xlsx.writeBuffer());
    };
    const upload = (file: Buffer, sub = adminId, name = 'jurados.xlsx') =>
      server()
        .post('/juror-edition/import')
        .set(as(sub))
        .attach('file', file, { filename: name, contentType: XLSX_MIME });

    /** Espera a que la cola mande los correos esperados (salen en segundo plano). */
    const waitForEmails = async (expected: number) => {
      for (let i = 0; i < 100 && emailCalls.length < expected; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 100)); // por si sobra alguno
    };

    const createUser = async (
      key: string,
      roleName: string,
      over: { isActive?: boolean; verified?: boolean } = {},
    ) => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      const status = await prisma.confirmationStatus.findUniqueOrThrow({
        where: { status: over.verified === false ? 'PENDIENTE' : 'CONFIRMADO' },
      });
      await prisma.user.create({
        data: {
          id: id(key),
          email:
            key === 'admin' || key === 'estudiante'
              ? `${id(key)}@uninorte.edu.co`
              : mail(key),
          roleId: role.id,
          firstName: 'IT',
          lastName: 'ARK280',
          isActive: over.isActive ?? true,
          confirmationStatusId: status.id,
        },
      });
      createdUserIds.push(id(key));
    };

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const edition = await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      });
      editionId = edition.id;

      await createUser('admin', 'Administrador');
      await createUser('estudiante', 'Estudiante');
      await createUser('pendiente', 'Jurado'); // en la edición como Pendiente
      await createUser('ya', 'Jurado'); // ya Confirmado
      await createUser('sinverificar', 'Jurado', {
        isActive: false,
        verified: false,
      });
      await createUser('alumno', 'Estudiante');
      await createUser('desactivado', 'Jurado', { isActive: false });
      await prisma.jurorEdition.createMany({
        data: [
          {
            jurorId: id('pendiente'),
            editionId,
            status: 'PENDING',
            type: 'OFFICIAL',
          },
          { jurorId: id('ya'), editionId, status: 'CONFIRMED', type: 'BACKUP' },
        ],
      });

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AzureStorageService)
        .useValue({})
        .overrideProvider(EmailService)
        .useValue(
          new Proxy(
            {
              sendEmail: jest.fn().mockResolvedValue(undefined),
              resendAuthEmailOfType: jest.fn((email: string) => {
                emailCalls.push(email);
                return Promise.resolve({ message: 'ok' });
              }),
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
      const others = await prisma.user.findMany({
        where: { email: { contains: `ark280-${runId}-` } },
        select: { id: true },
      });
      const ids = [...new Set([...createdUserIds, ...others.map((u) => u.id)])];
      await prisma.jurorEdition.deleteMany({ where: { jurorId: { in: ids } } });
      await prisma.verificationToken.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });

    it('la plantilla se descarga como xlsx con los encabezados', async () => {
      const res = await server()
        .get('/juror-edition/import/template')
        .set(as(adminId))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toContain(
        'plantilla-jurados.xlsx',
      );
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(res.body as ArrayBuffer);
      expect(book.getWorksheet('Jurados')?.getRow(1).getCell(3).value).toBe(
        'Correo',
      );
    });

    it('solo el Administrador puede importar y descargar la plantilla', async () => {
      const file = await workbook([['A', 'B', mail('x'), '']]);
      await upload(file, studentId).expect(403);
      await server()
        .get('/juror-edition/import/template')
        .set(as(studentId))
        .expect(403);
      await server()
        .post('/juror-edition/import')
        .attach('file', file, { filename: 'x.xlsx', contentType: XLSX_MIME })
        .expect(401);
    });

    it('un archivo que no es xlsx o sin las columnas da 400 y no cambia nada', async () => {
      const before = await prisma.jurorEdition.count({ where: { editionId } });
      await server()
        .post('/juror-edition/import')
        .set(as(adminId))
        .attach('file', Buffer.from('Nombres,Apellidos,Correo,Tipo\n'), {
          filename: 'jurados.csv',
          contentType: 'text/csv',
        })
        .expect(400);
      const bad = new ExcelJS.Workbook();
      bad.addWorksheet('X').addRows([
        ['A', 'B'],
        ['1', '2'],
      ]);
      const res = await upload(
        Buffer.from(await bad.xlsx.writeBuffer()),
      ).expect(400);
      expect(res.body).toMatchObject({
        message: expect.stringContaining('plantilla') as string,
      });
      await server().post('/juror-edition/import').set(as(adminId)).expect(400); // sin archivo
      expect(await prisma.jurorEdition.count({ where: { editionId } })).toBe(
        before,
      );
    });

    it('un archivo de más de 2 MB da 413', async () => {
      await upload(Buffer.alloc(2 * 1024 * 1024 + 10, 1)).expect(413);
    });

    describe('importación completa', () => {
      const rows = () => [
        ['Ana', 'Pérez', ` ${mail('nuevo1').toUpperCase()} `, 'Suplente'], // 2: cuenta nueva
        ['Luis', 'Argüello', mail('nuevo2'), ''], // 3: cuenta nueva, Oficial
        ['Pen', 'Diente', mail('pendiente'), 'Oficial'], // 4: Pendiente → Confirmado
        ['Ya', 'Estaba', mail('ya'), 'Oficial'], // 5: ya Confirmado
        ['Sin', 'Verificar', mail('sinverificar'), ''], // 6: reenvía verificación
        ['Al', 'Umno', mail('alumno'), ''], // 7: rol Estudiante
        ['Des', 'Activado', mail('desactivado'), ''], // 8: desactivado
        ['Eva', 'Ruiz', 'correo-malo', ''], // 9: correo inválido
        ['Ana', 'Repe', mail('nuevo1'), ''], // 10: repetido
        ['Tip', 'Malo', mail('tipo'), 'Senior'], // 11: tipo inválido
      ];

      it('crea, confirma y reporta cada fila; los correos salen en la cola', async () => {
        emailCalls.length = 0;
        const res = await upload(await workbook(rows())).expect(201);
        const body = res.body as ImportBody;

        const byRow = Object.fromEntries(
          body.rows.map((row) => [row.row, row]),
        );
        expect(byRow[2]).toMatchObject({
          email: mail('nuevo1'),
          result: 'CREATED',
          accountCreated: true,
          type: 'BACKUP',
          emailStatus: 'QUEUED',
        });
        expect(byRow[3]).toMatchObject({ result: 'CREATED', type: 'OFFICIAL' });
        expect(byRow[4]).toMatchObject({
          result: 'CONFIRMED',
          emailStatus: 'NOT_NEEDED',
        });
        expect(byRow[5]).toMatchObject({ result: 'ALREADY_CONFIRMED' });
        expect(byRow[6]).toMatchObject({
          result: 'CONFIRMED',
          emailStatus: 'QUEUED',
        });
        expect(byRow[7]).toMatchObject({
          result: 'ERROR',
          error: 'WRONG_ROLE',
        });
        expect(byRow[8]).toMatchObject({
          result: 'ERROR',
          error: 'ACCOUNT_DISABLED',
        });
        expect(byRow[9]).toMatchObject({
          result: 'ERROR',
          error: 'INVALID_EMAIL',
        });
        expect(byRow[10]).toMatchObject({
          result: 'ERROR',
          error: 'DUPLICATE_IN_FILE',
        });
        expect(byRow[11]).toMatchObject({
          result: 'ERROR',
          error: 'INVALID_TYPE',
        });
        expect(body.summary).toEqual({
          total: 10,
          created: 2,
          confirmed: 2,
          alreadyConfirmed: 1,
          errors: 5,
          emailsQueued: 3,
        });
        expect(body.edition.id).toBe(editionId);

        // Cuentas nuevas: rol Jurado, categoría Junior, con el tipo del Excel.
        const nuevo1 = await prisma.user.findFirstOrThrow({
          where: { email: mail('nuevo1') },
          include: { role: true, confirmationStatus: true },
        });
        expect(nuevo1).toMatchObject({
          firstName: 'Ana',
          lastName: 'Pérez',
          jurorCategory: 'JUNIOR',
          jurorType: 'BACKUP',
          isActive: true,
          role: { name: 'Jurado' },
          confirmationStatus: { status: 'PENDIENTE' },
        });
        const nuevo2 = await prisma.user.findFirstOrThrow({
          where: { email: mail('nuevo2') },
        });
        expect(nuevo2.lastName).toBe('Argüello');

        // Confirmados en la edición activa, con el tipo del Excel.
        const confirmed = await prisma.jurorEdition.findMany({
          where: {
            editionId,
            jurorId: { in: [nuevo1.id, nuevo2.id, id('pendiente'), id('ya')] },
          },
          select: { jurorId: true, status: true, type: true },
        });
        expect(
          Object.fromEntries(confirmed.map((r) => [r.jurorId, r])),
        ).toEqual({
          [nuevo1.id]: {
            jurorId: nuevo1.id,
            status: 'CONFIRMED',
            type: 'BACKUP',
          },
          [nuevo2.id]: {
            jurorId: nuevo2.id,
            status: 'CONFIRMED',
            type: 'OFFICIAL',
          },
          [id('pendiente')]: {
            jurorId: id('pendiente'),
            status: 'CONFIRMED',
            type: 'OFFICIAL',
          },
          // «ya» estaba Confirmado como Suplente: no se toca.
          [id('ya')]: {
            jurorId: id('ya'),
            status: 'CONFIRMED',
            type: 'BACKUP',
          },
        });
        // Las filas con error no dejaron nada.
        expect(
          await prisma.jurorEdition.count({
            where: {
              editionId,
              jurorId: { in: [id('alumno'), id('desactivado')] },
            },
          }),
        ).toBe(0);
        expect(
          await prisma.user.count({ where: { email: mail('tipo') } }),
        ).toBe(0);

        // Correos: dos cuentas nuevas y la sin verificar, una vez cada una, en segundo plano.
        await waitForEmails(3);
        expect(emailCalls.slice().sort()).toEqual(
          [mail('nuevo1'), mail('nuevo2'), mail('sinverificar')].sort(),
        );
      });

      it('volver a importar el mismo archivo no duplica a nadie', async () => {
        emailCalls.length = 0;
        const res = await upload(await workbook(rows())).expect(201);
        const body = res.body as ImportBody;

        expect(body.summary).toMatchObject({
          created: 0,
          confirmed: 0,
          alreadyConfirmed: 5,
          errors: 5,
        });
        const emails = [
          mail('nuevo1'),
          mail('nuevo2'),
          mail('pendiente'),
          mail('ya'),
          mail('sinverificar'),
        ];
        const users = await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true },
        });
        expect(users).toHaveLength(5);
        expect(
          await prisma.jurorEdition.count({
            where: { editionId, jurorId: { in: users.map((u) => u.id) } },
          }),
        ).toBe(5);
      });

      it('la lista de la edición muestra a los importados como Confirmados', async () => {
        const res = await server()
          .get('/juror-edition?status=CONFIRMED&limit=100&search=ark280')
          .set(as(adminId))
          .expect(200);
        const listed = (res.body as { data: { email: string }[] }).data.map(
          (item) => item.email,
        );
        expect(listed).toEqual(
          expect.arrayContaining([
            mail('nuevo1'),
            mail('nuevo2'),
            mail('pendiente'),
            mail('ya'),
          ]),
        );
      });
    });

    it('el endpoint import-previous ya no existe', async () => {
      await server()
        .post('/juror-edition/import-previous')
        .set(as(adminId))
        .send({})
        .expect(404);
    });
  },
);
