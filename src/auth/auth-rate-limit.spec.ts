import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { PUBLIC_LIMITS } from '../common/throttle/public-throttle';

/*
 ARK-SP1 (#7, U4): límites de intentos en login, reset-password y resend-confirmation.
 Cada caso crea una aplicación nueva: así el contador en memoria del throttler empieza en cero
 y las pruebas no dependen del orden.
*/
describe('Límite de intentos en /auth', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    sendPublicAuthEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    authService.login.mockResolvedValue({ message: 'Login successful', access: 'a', refresh: 'r', accessTokenExpiresIn: 900 });
    authService.sendPublicAuthEmail.mockResolvedValue({ message: 'ok' });
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: JwtStrategy, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: CacheService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (url: string, body: object) => request(app.getHttpServer()).post(url).send(body);
  const login = () => post('/auth/login', { email: 'a@uninorte.edu.co', password: 'Pass1234' });

  const loginAs = (email: string) => post('/auth/login', { email, password: 'Pass1234' });

  it('POST /auth/login: el intento 11 del mismo correo en un minuto devuelve 429', async () => {
    for (let i = 0; i < PUBLIC_LIMITS.login.limit; i++) {
      expect((await login()).status).not.toBe(429);
    }
    expect((await login()).status).toBe(429);
  });

  it('login: el correo se normaliza (mayúsculas y espacios cuentan como el mismo)', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await loginAs(i % 2 ? 'A@Uninorte.edu.co' : 'a@uninorte.edu.co')).status).not.toBe(429);
    }
    expect((await loginAs('a@uninorte.edu.co')).status).toBe(429);
  });

  it('login: 11 correos distintos desde la misma IP no producen ningún 429', async () => {
    for (let i = 0; i < 11; i++) {
      expect((await loginAs(`u${i}@uninorte.edu.co`)).status).not.toBe(429);
    }
  });

  it('login: el intento 101 desde la misma IP con correos distintos devuelve 429', async () => {
    for (let i = 0; i < PUBLIC_LIMITS.loginIp.limit; i++) {
      expect((await loginAs(`u${i}@uninorte.edu.co`)).status).not.toBe(429);
    }
    expect((await loginAs('otro@uninorte.edu.co')).status).toBe(429);
  }, 60_000);

  it('login: sin correo en el cuerpo cuenta solo por IP y no falla', async () => {
    expect((await post('/auth/login', {})).status).not.toBe(500);
  });

  it('login válido no se ve afectado por el límite', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await login();
      expect(res.status).toBe(201);
      expect((res.body as { access: string }).access).toBe('a');
    }
  });

  it.each(['reset-password', 'resend-confirmation'])('%s: el intento 6 devuelve 429', async (route) => {
    for (let i = 0; i < 5; i++) {
      expect((await post(`/auth/${route}`, { email: 'a@uninorte.edu.co' })).status).toBe(200);
    }
    expect((await post(`/auth/${route}`, { email: 'a@uninorte.edu.co' })).status).toBe(429);
  });

  it('los límites son los acordados', () => {
    expect(PUBLIC_LIMITS.login).toEqual({ limit: 10, ttl: 60_000 });
    expect(PUBLIC_LIMITS.loginIp).toEqual({ limit: 100, ttl: 60_000 });
    expect(PUBLIC_LIMITS.resetPassword).toEqual({ limit: 5, ttl: 10 * 60_000 });
    expect(PUBLIC_LIMITS.resendConfirmation).toEqual({ limit: 5, ttl: 10 * 60_000 });
    expect(PUBLIC_LIMITS.validateEmails).toEqual({ limit: 15, ttl: 60_000 });
  });
});
