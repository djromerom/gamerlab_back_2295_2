import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PUBLIC_LIMITS } from '../src/common/throttle/public-throttle';
import { AzureStorageService } from '../src/upload/azure-storage.service';
import { VISITOR_COOKIE } from '../src/videogames/like-visitor';

/**
 * Likes sin iniciar sesión, por HTTP contra PostgreSQL real con la aplicación completa:
 * el visitante sin cuenta recibe una cookie anónima en su primer like, no puede repetir el like
 * con ella, puede quitarlo, los usuarios con sesión siguen igual, una sesión vencida da 401 y
 * el POST limita las peticiones por IP.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Crea un equipo con su videojuego y un usuario, y los borra al final.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.SOCKET_KEY_SECRET ??= 'e2e-socket-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type ToggleBody = { liked: boolean; likeCount: number };

/** Valor de la cookie de visitante que dejó la respuesta, si la dejó. */
function visitorCookieOf(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${VISITOR_COOKIE}=`));
  return cookie?.split(';')[0].slice(VISITOR_COOKIE.length + 1);
}

describeIfDb('Likes sin iniciar sesión (HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36);
  let app: INestApplication;
  let userId: string;
  let teamId: number;
  let videogameId: number;

  const server = () => request(app.getHttpServer() as never);
  const toggle = (cookie?: string) => {
    const req = server().post(`/videogames/${videogameId}/toggle-like`);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const myLike = (cookie?: string) => {
    const req = server().get(`/videogames/${videogameId}/my-like`);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const visitor = (id: string) => `${VISITOR_COOKIE}=${id}`;
  const session = () =>
    `access-token=${jwt.sign({ sub: userId, email: `it-likes-${runId}@uninorte.edu.co`, type: 'access' }, { expiresIn: 900 })}`;
  const likesInDb = () =>
    prisma.videogameLike.count({ where: { videogameId } });

  const createApp = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AzureStorageService)
      .useValue({})
      .compile();
    const created = moduleRef.createNestApplication();
    created.use(cookieParser());
    await created.init();
    return created;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const edition = await prisma.edition.findFirstOrThrow({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'Estudiante' },
    });
    userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `it-likes-${runId}@uninorte.edu.co`,
        roleId: role.id,
        firstName: 'IT',
        lastName: 'Likes',
      },
    });
    const team = await prisma.team.create({
      data: {
        teamName: `Likes ${runId}`,
        userId,
        editionId: edition.id,
        teamCode: `N1-LK-${runId.slice(-5)}`,
        // Con video: sin los topes de 10 y 20 likes de los juegos sin contenido
        videogame: {
          create: {
            name: `Likes ${runId}`.slice(0, 30),
            videoUrl: 'https://youtu.be/x',
          },
        },
      },
      include: { videogame: true },
    });
    teamId = team.id;
    videogameId = team.videogame!.id;
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    if (teamId) await prisma.team.delete({ where: { id: teamId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('sin sesión ni cookie: da el like y deja la cookie anónima', async () => {
    const res = await toggle();
    expect(res.status).toBe(201);
    expect(res.body as ToggleBody).toEqual({ liked: true, likeCount: 1 });
    const id = visitorCookieOf(res);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    const row = await prisma.videogameLike.findFirstOrThrow({
      where: { videogameId },
    });
    expect(row).toMatchObject({ visitorId: id, userId: null });
  });

  it('con la misma cookie: my-like dice que sí, y el toggle quita el like', async () => {
    const id = (
      await prisma.videogameLike.findFirstOrThrow({ where: { videogameId } })
    ).visitorId!;
    expect((await myLike(visitor(id))).body).toEqual({ liked: true });
    expect((await myLike()).body).toEqual({ liked: false });

    const res = await toggle(visitor(id));
    expect(res.status).toBe(201);
    expect(res.body as ToggleBody).toEqual({ liked: false, likeCount: 0 });
    expect(visitorCookieOf(res)).toBeUndefined(); // reutiliza la cookie, no crea otra
    expect((await myLike(visitor(id))).body).toEqual({ liked: false });
    expect(await likesInDb()).toBe(0);
  });

  it('cada visitante y cada usuario cuentan un like', async () => {
    const a = randomUUID();
    const b = randomUUID();
    expect((await toggle(visitor(a))).body).toEqual({
      liked: true,
      likeCount: 1,
    });
    expect((await toggle(visitor(b))).body).toEqual({
      liked: true,
      likeCount: 2,
    });

    const res = await toggle(session());
    expect(res.body).toEqual({ liked: true, likeCount: 3 });
    expect(visitorCookieOf(res)).toBeUndefined(); // con sesión no se crea cookie de visitante
    expect((await myLike(session())).body).toEqual({ liked: true });
    expect(
      await prisma.videogameLike.count({ where: { videogameId, userId } }),
    ).toBe(1);

    // Con sesión manda el usuario aunque también tenga cookie de visitante
    expect((await toggle(`${session()}; ${visitor(a)}`)).body).toEqual({
      liked: false,
      likeCount: 2,
    });
    expect((await myLike(visitor(a))).body).toEqual({ liked: true });
  });

  it('una cookie de visitante que no es un UUID se ignora y se crea otra', async () => {
    const res = await toggle(visitor('no-es-un-uuid'));
    expect(res.status).toBe(201);
    expect(visitorCookieOf(res)).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      await prisma.videogameLike.count({
        where: { visitorId: 'no-es-un-uuid' },
      }),
    ).toBe(0);
  });

  it('sesión vencida o inválida: 401 para que el front renueve, sin guardar el like', async () => {
    const before = await likesInDb();
    const expired = `access-token=${jwt.sign({ sub: userId, type: 'access' }, { expiresIn: -10 })}`;
    expect((await toggle(expired)).status).toBe(401);
    expect((await toggle('access-token=basura')).status).toBe(401);
    expect(
      (
        await server()
          .post(`/videogames/${videogameId}/toggle-like`)
          .set('X-Arkad-Session', '1')
      ).status,
    ).toBe(401);
    expect((await myLike(expired)).status).toBe(401);
    expect(await likesInDb()).toBe(before);
  });

  it('juego que no existe: 404', async () => {
    expect(
      (await server().post('/videogames/999999999/toggle-like')).status,
    ).toBe(404);
  });

  it('la base exige exactamente un autor: usuario o visitante', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO videogame_likes (id_videojuego) VALUES (${videogameId})`,
    ).rejects.toThrow(/videogame_likes_un_autor_check/);
    await expect(
      prisma.$executeRaw`INSERT INTO videogame_likes (id_videojuego, user_id, visitor_id) VALUES (${videogameId}, ${userId}, ${randomUUID()})`,
    ).rejects.toThrow(/videogame_likes_un_autor_check/);
  });

  it('limita los likes por IP + visitante', async () => {
    await app.close();
    app = await createApp(); // contadores en cero
    const id = randomUUID();
    for (let i = 0; i < PUBLIC_LIMITS.like.limit; i += 1) {
      expect((await toggle(visitor(id))).status).toBe(201);
    }
    expect((await toggle(visitor(id))).status).toBe(429);
    // Otro visitante de la misma IP sigue pudiendo (el tope por IP sola es más alto)
    expect((await toggle(visitor(randomUUID()))).status).toBe(201);
  });

  it('limita los likes por IP sola aunque cada petición llegue sin cookie', async () => {
    await app.close();
    app = await createApp();
    for (let i = 0; i < PUBLIC_LIMITS.likeIp.limit; i += 1) {
      expect((await toggle()).status).toBe(201);
    }
    expect((await toggle()).status).toBe(429);
  });
});
