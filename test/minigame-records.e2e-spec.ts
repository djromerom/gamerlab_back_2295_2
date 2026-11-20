import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MinigameGame, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PUBLIC_LIMITS } from '../src/common/throttle/public-throttle';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-52 (ARK-315): récords de los minijuegos de la landing por HTTP contra PostgreSQL real, con la
 * aplicación completa (guards globales y ValidationPipe): las rutas son públicas, el top guarda
 * solo los 5 mejores de cada canción, se rechazan alias y puntajes imposibles, la base tiene su
 * propio CHECK del puntaje y el POST limita las peticiones por IP.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Usa dos canciones de Arkad Jam que el juego no tiene (bateria-48 y bateria-49) y borra lo que creó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

const TRACK = 'bateria-49';
const OTHER_TRACK = 'bateria-48';
type RecordsBody = {
  game: string;
  track: string | null;
  saved?: boolean;
  position?: number | null;
  top: {
    position: number;
    alias: string;
    score: number;
    track: string;
    createdAt: string;
  }[];
  code?: string;
};
const bodyOf = (res: request.Response) => res.body as RecordsBody;

const DASH_ALIAS = `e2e${Date.now().toString(36).slice(-6)}`;

describeIfDb('Récords de los minijuegos (HU-52, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  let app: INestApplication;
  const server = () => request(app.getHttpServer() as never);
  const save = (body: object) => server().post('/minigame-records').send(body);
  const jam = (alias: string, score: number, track = TRACK) =>
    save({ game: 'ARKAD_JAM', track, alias, score });

  const cleanUp = async () => {
    await prisma.minigameRecord.deleteMany({
      where: {
        OR: [
          { game: MinigameGame.ARKAD_JAM, track: { in: [TRACK, OTHER_TRACK] } },
          { game: MinigameGame.ARKADASH, alias: DASH_ALIAS },
        ],
      },
    });
  };

  // Cada aplicación tiene sus propios contadores del límite de peticiones (en memoria).
  const createApp = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AzureStorageService)
      .useValue({})
      .compile();
    const created = moduleRef.createNestApplication();
    created.use(cookieParser());
    created.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await created.init();
    return created;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await cleanUp();
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    await cleanUp();
    await prisma.$disconnect();
  });

  it('GET sin sesión: top vacío de una canción nueva', async () => {
    const res = await server()
      .get('/minigame-records')
      .query({ game: 'ARKAD_JAM', track: TRACK });
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({ game: 'ARKAD_JAM', track: TRACK, top: [] });
  });

  it('POST sin sesión guarda el puntaje y devuelve su puesto', async () => {
    const res = await jam('  Pixel  ', 4200);
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({
      game: 'ARKAD_JAM',
      track: TRACK,
      saved: true,
      position: 1,
    });
    expect(bodyOf(res).top).toEqual([
      {
        position: 1,
        alias: 'Pixel',
        score: 4200,
        track: TRACK,
        createdAt: expect.any(String) as string,
      },
    ]);
  });

  it('guarda solo los 5 mejores de la canción y no toca las otras', async () => {
    await jam('Otra', 10, OTHER_TRACK);
    for (const [alias, score] of [
      ['Nova', 3000],
      ['Byte', 2000],
      ['Luna', 1000],
      ['Zeta', 500],
    ] as const) {
      expect(bodyOf(await jam(alias, score)).saved).toBe(true);
    }
    const better = await jam('Rayo', 2500);
    expect(bodyOf(better)).toMatchObject({ saved: true, position: 3 });
    expect(bodyOf(better).top.map((r) => r.alias)).toEqual([
      'Pixel',
      'Nova',
      'Rayo',
      'Byte',
      'Luna',
    ]);
    const worse = await jam('Lento', 1000);
    expect(bodyOf(worse)).toMatchObject({ saved: false, position: null });

    expect(await prisma.minigameRecord.count({ where: { track: TRACK } })).toBe(
      5,
    );
    expect(
      await prisma.minigameRecord.count({ where: { track: OTHER_TRACK } }),
    ).toBe(1);

    const all = await server()
      .get('/minigame-records')
      .query({ game: 'ARKAD_JAM' });
    expect(all.status).toBe(200);
    expect(bodyOf(all).track).toBeNull();
    expect(bodyOf(all).top.length).toBeLessThanOrEqual(5);
  });

  it('Arkadash tiene un solo récord global', async () => {
    const res = await save({
      game: 'ARKADASH',
      alias: DASH_ALIAS,
      score: 9999,
    });
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toMatchObject({
      game: 'ARKADASH',
      track: 'global',
      saved: true,
    });
    const top = await server()
      .get('/minigame-records')
      .query({ game: 'ARKADASH' });
    expect(bodyOf(top).top.some((r) => r.alias === DASH_ALIAS)).toBe(true);
  });

  it.each([
    [{ game: 'TETRIS', alias: 'Pixel', score: 5 }, undefined],
    [
      { game: 'ARKAD_JAM', alias: 'Pixel', score: 5 },
      'MINIGAME_RECORD_INVALID',
    ],
    [
      { game: 'ARKADASH', track: TRACK, alias: 'Pixel', score: 5 },
      'MINIGAME_RECORD_INVALID',
    ],
    [
      { game: 'ARKAD_JAM', track: TRACK, alias: 'yo', score: 5 },
      'MINIGAME_ALIAS_INVALID',
    ],
    [
      { game: 'ARKAD_JAM', track: TRACK, alias: 'ana@x.co', score: 5 },
      'MINIGAME_ALIAS_INVALID',
    ],
    [
      { game: 'ARKAD_JAM', track: TRACK, alias: '200123456', score: 5 },
      'MINIGAME_ALIAS_PERSONAL_DATA',
    ],
    [
      { game: 'ARKADASH', alias: 'Pixel', score: 10_001 },
      'MINIGAME_SCORE_IMPOSSIBLE',
    ],
    [
      { game: 'ARKAD_JAM', track: TRACK, alias: 'Pixel', score: 100_001 },
      'MINIGAME_SCORE_IMPOSSIBLE',
    ],
    [
      { game: 'ARKAD_JAM', track: TRACK, alias: 'Pixel', score: 0 },
      'MINIGAME_SCORE_IMPOSSIBLE',
    ],
  ])('POST %p responde 400 (%s)', async (body, code) => {
    const res = await save(body);
    expect(res.status).toBe(400);
    if (code) expect(bodyOf(res).code).toBe(code);
  });

  it('GET con una canción que no existe responde 400', async () => {
    const res = await server()
      .get('/minigame-records')
      .query({ game: 'ARKAD_JAM', track: 'flauta-1' });
    expect(res.status).toBe(400);
    expect(bodyOf(res).code).toBe('MINIGAME_RECORD_INVALID');
  });

  it('la base rechaza un puntaje fuera del tope aunque no pase por el back', async () => {
    await expect(
      prisma.minigameRecord.create({
        data: {
          game: MinigameGame.ARKAD_JAM,
          track: OTHER_TRACK,
          alias: 'Trampa',
          score: 100_001,
        },
      }),
    ).rejects.toThrow(/record_minijuego_puntaje_check/);
  });

  it(`POST: la petición ${PUBLIC_LIMITS.minigameRecordsSave.limit + 1} en un minuto responde 429`, async () => {
    await app.close();
    app = await createApp(); // contadores en cero
    const statuses: number[] = [];
    for (let i = 0; i <= PUBLIC_LIMITS.minigameRecordsSave.limit; i++) {
      statuses.push((await jam('Spam', 1, OTHER_TRACK)).status);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });
});
