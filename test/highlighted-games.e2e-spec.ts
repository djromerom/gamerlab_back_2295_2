import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-41 (ARK-229): juegos destacados en vivo e históricos por HTTP contra PostgreSQL real, con la
 * aplicación completa (guards, permisos del seed y ValidationPipe): el CHECK de `juego_destacado`,
 * el POST del administrador, el listado público sin sesión, el listado de siempre (solo en vivo) y
 * el DELETE del histórico.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Crea sus propias ediciones (archivadas) y borra al final lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type PublicGame = {
  id: number;
  name: string;
  teamName: string;
  edition: { id: number; year: number; semester: number; title: string };
  logoUrl: string | null;
  hasGameFile: boolean;
  play: { type: 'live' | 'historical'; id: number };
};

describeIfDb(
  'Juegos destacados en vivo e históricos (HU-41, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const userId = (name: string) => `it-ark229-${runId}-${name}`;
    const roleUsers: Record<string, string> = {
      Administrador: userId('admin'),
      Estudiante: userId('estudiante'),
    };
    const year = 2900 + (Date.now() % 90);

    let app: INestApplication;
    let editionId: number;
    let otherEditionId: number;
    let liveGameId: number;
    let historicalGameId: number;
    let otherHistoricalGameId: number;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const admin = () => as(roleUsers.Administrador);
    const student = () => as(roleUsers.Estudiante);
    const server = () => request(app.getHttpServer() as never);
    const adminPath = (id: number) => `/editions/${id}/highlighted-games`;

    const createEdition = (semester: number) =>
      prisma.edition.create({
        data: {
          year,
          semester,
          title: `it-ark229-${runId}-${semester}`,
          startsAt: new Date(Date.UTC(year, 0, 1)),
          endsAt: new Date(Date.UTC(year, 0, 31)),
          status: EditionStatus.ARCHIVED,
        },
      });
    const createHistoricalGame = (
      edition: number,
      name: string,
      gameFileUrl: string | null,
    ) =>
      prisma.historicalTeam.create({
        data: {
          teamName: `Hist ${name}`,
          editionId: edition,
          teamCode: `H-${runId.slice(-6)}-${name.slice(0, 2)}`.slice(0, 12),
          videogame: { create: { name, gameFileUrl } },
        },
        include: { videogame: true },
      });

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
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
            lastName: 'ARK229',
          },
        });
      }
      editionId = (await createEdition(10)).id;
      otherEditionId = (await createEdition(30)).id;

      const team = await prisma.team.create({
        data: {
          teamName: `it-ark229-${runId}`,
          userId: roleUsers.Estudiante,
          editionId,
          teamCode: `N1-X-${runId.slice(-5)}`,
          videogame: {
            create: {
              name: 'Zeta en vivo',
              videogameStatusId: 1,
              gameFileUrl: 'https://example.test/juego.zip',
            },
          },
        },
        include: { videogame: true },
      });
      liveGameId = team.videogame!.id;
      historicalGameId = (
        await createHistoricalGame(editionId, 'Alfa historico', '  ')
      ).videogame!.id;
      otherHistoricalGameId = (
        await createHistoricalGame(
          otherEditionId,
          'Beta otra',
          'https://example.test/b.zip',
        )
      ).videogame!.id;

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
      const editionIds = [editionId, otherEditionId].filter(Boolean);
      await prisma.highlightedGame.deleteMany({
        where: { editionId: { in: editionIds } },
      });
      await prisma.team.deleteMany({
        where: { editionId: { in: editionIds } },
      });
      await prisma.historicalTeam.deleteMany({
        where: { editionId: { in: editionIds } },
      });
      await prisma.edition.deleteMany({ where: { id: { in: editionIds } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: Object.values(roleUsers) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: Object.values(roleUsers) } },
      });
      await prisma.$disconnect();
    });

    // Un solo recorrido: cada paso depende del anterior.
    it('la base exige exactamente un videojuego por destacado (CHECK)', async () => {
      const insert = (live: number | null, historical: number | null) =>
        prisma.$executeRaw`INSERT INTO "juego_destacado" ("id_edicion", "id_videojuego", "id_videojuego_historico", "actualizado_en")
        VALUES (${editionId}, ${live}, ${historical}, now())`;
      await expect(insert(null, null)).rejects.toThrow(
        /juego_destacado_un_videojuego_check/,
      );
      await expect(insert(liveGameId, historicalGameId)).rejects.toThrow(
        /juego_destacado_un_videojuego_check/,
      );
      expect(await prisma.highlightedGame.count({ where: { editionId } })).toBe(
        0,
      );
    });

    it('sin sesión (401) o sin permiso (403) no se puede destacar ni quitar un histórico', async () => {
      const body = { historicalVideogameId: historicalGameId };
      await server().post(adminPath(editionId)).send(body).expect(401);
      await server()
        .post(adminPath(editionId))
        .set(student())
        .send(body)
        .expect(403);
      await server()
        .delete(`${adminPath(editionId)}/historical/${historicalGameId}`)
        .expect(401);
      await server()
        .delete(`${adminPath(editionId)}/historical/${historicalGameId}`)
        .set(student())
        .expect(403);
    });

    it('el administrador destaca un histórico de la edición y uno en vivo', async () => {
      const historical = await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({ historicalVideogameId: historicalGameId })
        .expect(201);
      expect(historical.body).toMatchObject({
        editionId,
        videogameId: null,
        historicalVideogameId: historicalGameId,
      });

      await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({ videogameId: liveGameId })
        .expect(201);
    });

    it('rechaza repetidos (409), históricos de otra edición y los dos o ningún id (400)', async () => {
      await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({ historicalVideogameId: historicalGameId })
        .expect(409);
      await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({ videogameId: liveGameId })
        .expect(409);
      await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({ historicalVideogameId: otherHistoricalGameId })
        .expect(400);
      await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({
          videogameId: liveGameId,
          historicalVideogameId: historicalGameId,
        })
        .expect(400);
      await server()
        .post(adminPath(editionId))
        .set(admin())
        .send({})
        .expect(400);
    });

    it('GET /highlighted-games es pública y filtra por edición', async () => {
      const res = await server()
        .get(`/highlighted-games?editionId=${editionId}`)
        .expect(200);
      const games = res.body as PublicGame[];
      const edition = {
        id: editionId,
        year,
        semester: 10,
        title: `it-ark229-${runId}-10`,
      };
      expect(games).toEqual([
        expect.objectContaining({
          name: 'Alfa historico',
          teamName: 'Hist Alfa historico',
          edition,
          logoUrl: null,
          hasGameFile: false,
          play: { type: 'historical', id: historicalGameId },
        }),
        expect.objectContaining({
          name: 'Zeta en vivo',
          teamName: `it-ark229-${runId}`,
          edition,
          hasGameFile: true,
          play: { type: 'live', id: liveGameId },
        }),
      ]);
      expect(JSON.stringify(games)).not.toMatch(/email|members|uninorte/i);

      await server()
        .get(`/highlighted-games?editionId=${otherEditionId}`)
        .expect(200, []);
      await server()
        .get('/highlighted-games?editionId=999999999')
        .expect(200, []);
      await server().get('/highlighted-games?editionId=abc').expect(400);
    });

    it('sin editionId devuelve todas las ediciones, la más reciente primero', async () => {
      const res = await server().get('/highlighted-games').expect(200);
      const games = res.body as PublicGame[];
      expect(games.filter((g) => g.edition.id === editionId)).toHaveLength(2);
      const keys = games.map((g) => g.edition.year * 100 + g.edition.semester);
      expect(keys).toEqual([...keys].sort((a, b) => b - a));
    });

    it('GET /editions/:editionId/highlighted-games sigue devolviendo solo juegos en vivo', async () => {
      const res = await server().get(adminPath(editionId)).expect(200);
      const body = res.body as {
        data: { videogame: { id: number; name: string } }[];
        metadata: { totalItems: number };
      };
      expect(body.metadata.totalItems).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].videogame).toMatchObject({
        id: liveGameId,
        name: 'Zeta en vivo',
      });
    });

    it('el administrador quita el histórico (y 404 si ya no está)', async () => {
      await server()
        .delete(`${adminPath(editionId)}/historical/${historicalGameId}`)
        .set(admin())
        .expect(200);
      await server()
        .delete(`${adminPath(editionId)}/historical/${historicalGameId}`)
        .set(admin())
        .expect(404);
      const res = await server()
        .get(`/highlighted-games?editionId=${editionId}`)
        .expect(200);
      expect((res.body as PublicGame[]).map((g) => g.play)).toEqual([
        { type: 'live', id: liveGameId },
      ]);
    });

    it('borrar el juego histórico borra su destacado (ON DELETE CASCADE)', async () => {
      await prisma.highlightedGame.create({
        data: {
          editionId: otherEditionId,
          historicalVideogameId: otherHistoricalGameId,
        },
      });
      await prisma.historicalVideogame.delete({
        where: { id: otherHistoricalGameId },
      });
      expect(
        await prisma.highlightedGame.count({
          where: { editionId: otherEditionId },
        }),
      ).toBe(0);
    });
  },
);
