import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { TeamsController } from '../teams/controllers/teams.controller';
import { TeamsService } from '../teams/services/teams.service';
import { UploadController } from '../upload/upload.controller';
import { ZipUploadAccessGuard } from '../upload/zip-upload-access.guard';
import { AzureStorageService } from '../upload/azure-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from './settings.service';
import { RegistrationsOpenOrSessionGuard } from './registrations-open.guard';

// Sesión simulada: cabecera x-role = id de rol (1 = Administrador)
const fakeAuth: CanActivate = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const role = req.headers['x-role'];
    if (role) req.user = { id: 'u1', roleId: Number(role) };
    return true;
  },
};
const allow: CanActivate = { canActivate: () => true };

describe('Inscripciones abiertas en rutas públicas', () => {
  let app: INestApplication;
  let open = false;
  const teams = { create: jest.fn().mockResolvedValue({ id: 1 }) };
  const azure = { uploadFile: jest.fn().mockResolvedValue({ id: 'x' }) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [TeamsController, UploadController],
      providers: [
        { provide: TeamsService, useValue: teams },
        { provide: AzureStorageService, useValue: azure },
        { provide: SettingsService, useValue: { getRegistrationsOpen: async () => ({ registrationsOpen: open }) } },
        {
          provide: PrismaService,
          useValue: { role: { findUnique: async ({ where }: any) => ({ name: where.id === 1 ? 'Administrador' : 'Estudiante' }) } },
        },
        { provide: CacheService, useValue: { get: async () => null, set: async () => undefined } },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
      ],
    })
      .overrideGuard(OptionalJwtAuthGuard).useValue(fakeAuth)
      .overrideGuard(ThrottlerGuard).useValue(allow)
      .overrideGuard(ZipUploadAccessGuard).useValue(allow)
      .overrideGuard(RolePermissionGuard).useValue(allow)
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  const png = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
  const calls: Array<[string, (r: request.Test) => request.Test]> = [
    ['POST /teams', (r) => r.send({})],
    ['POST /upload', (r) => r.attach('file', png, { filename: 'a.png', contentType: 'image/png' })],
    ['POST /upload/zip', (r) => r.attach('file', Buffer.from('PK\x03\x04'), { filename: 'a.zip', contentType: 'application/zip' })],
  ];

  describe.each(calls)('%s', (label, build) => {
    const path = label.split(' ')[1];
    const send = (role?: number) => {
      const r = request(app.getHttpServer()).post(path);
      if (role) r.set('x-role', String(role));
      return build(r);
    };

    it('cerradas + sin sesión -> 403', async () => {
      open = false;
      const res = await send();
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Las inscripciones están cerradas');
    });
    it('cerradas + autenticado no admin -> ' + (label === 'POST /teams' ? '403' : 'pasa'), async () => {
      open = false;
      const status = (await send(2)).status;
      if (label === 'POST /teams') expect(status).toBe(403);
      else expect(status).not.toBe(403);
    });
    it('cerradas + Administrador -> no 403', async () => {
      open = false;
      expect((await send(1)).status).not.toBe(403);
    });
    it('abiertas + sin sesión -> no 403', async () => {
      open = true;
      expect((await send()).status).not.toBe(403);
    });
  });

  it('POST /teams cerradas: el servicio (reCAPTCHA) no se ejecuta', async () => {
    open = false;
    teams.create.mockClear();
    await request(app.getHttpServer()).post('/teams').send({});
    expect(teams.create).not.toHaveBeenCalled();
  });
});

describe('Orden de guards en /upload', () => {
  const guardsOf = (m: string) =>
    Reflect.getMetadata('__guards__', (UploadController.prototype as any)[m]) as unknown[];

  it('uploadImage: ThrottlerGuard va primero', () => {
    expect(guardsOf('uploadImage')[0]).toBe(ThrottlerGuard);
  });

  // /upload/zip no lleva ThrottlerGuard (Task 10): el límite de anónimos lo aplica
  // ZipUploadAccessGuard, que debe correr antes de consultar las inscripciones.
  it('uploadGameFile: OptionalJwt, ZipUploadAccess y luego RegistrationsOpenOrSession, sin ThrottlerGuard', () => {
    expect(guardsOf('uploadGameFile')).toEqual([
      OptionalJwtAuthGuard,
      ZipUploadAccessGuard,
      RegistrationsOpenOrSessionGuard,
    ]);
  });
});

describe('OptionalJwtAuthGuard real con cookie basura', () => {
  // Estrategia 'jwt' real de passport-jwt que rechaza cualquier token (no hay secreto válido para la cookie basura)
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const passport = require('passport');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Strategy, ExtractJwt } = require('passport-jwt');
    passport.use('jwt', new Strategy(
      { secretOrKey: 'test', jwtFromRequest: ExtractJwt.fromExtractors([(r: any) => r.headers.cookie?.split('=')[1] ?? null]) },
      (_p: unknown, done: any) => done(null, false),
    ));
  });
  it('se trata como anónimo: 403 con inscripciones cerradas', async () => {
    const mod = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: AzureStorageService, useValue: {} },
        { provide: SettingsService, useValue: { getRegistrationsOpen: async () => ({ registrationsOpen: false }) } },
        { provide: PrismaService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
      ],
    })
      .overrideGuard(ThrottlerGuard).useValue(allow)
      .overrideGuard(ZipUploadAccessGuard).useValue(allow)
      .compile();
    const a = mod.createNestApplication();
    await a.init();
    const res = await request(a.getHttpServer()).post('/upload').set('Cookie', 'access_token=basura').send();
    expect(res.status).toBe(403);
    await a.close();
  });
});
