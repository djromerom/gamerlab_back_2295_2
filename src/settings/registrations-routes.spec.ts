import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { TeamsController } from '../teams/controllers/teams.controller';
import { TeamsService } from '../teams/services/teams.service';
import { UploadController } from '../upload/upload.controller';
import { AzureStorageService } from '../upload/azure-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from './settings.service';

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
