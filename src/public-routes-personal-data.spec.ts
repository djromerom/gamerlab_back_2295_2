/*
 BG-02: ninguna ruta pública (@Public) puede devolver correos ni códigos estudiantiles.

 La prueba levanta la aplicación completa con un PrismaService falso que responde a cada
 consulta con filas inventadas, armadas según el modelo y el select/include que pidió el
 servicio (igual que haría Prisma). Los campos de correo y código llevan valores trampa.
 Luego recorre todas las rutas GET marcadas con @Public y falla si alguna respuesta,
 sin sesión, contiene un correo o un código trampa. No necesita base de datos.
*/
// Valores falsos solo para que los servicios arranquen; ninguna llamada externa se hace.
const FAKE_ENV: Record<string, string> = {
  JWT_SECRET: 'test-secret',
  AZURE_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
  AZURE_TENANT_ID: 'test',
  AZURE_CLIENT_ID: 'test',
  AZURE_CLIENT_SECRET: 'test',
  REDIRECT_URI: 'http://localhost/callback',
  FRONTEND_URL: 'http://localhost:5173',
};
for (const [key, value] of Object.entries(FAKE_ENV)) {
  process.env[key] = process.env[key] || value;
}

import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from './app.module';
import { IS_PUBLIC_KEY } from './auth/decorators/public.decorator';
import { EmailService } from './email/email.service';
import { PrismaService } from './prisma/prisma.service';
import { RecaptchaService } from './teams/services/recaptcha.service';
import { AzureStorageService } from './upload/azure-storage.service';
import { PUBLIC_LIMITS } from './common/throttle/public-throttle';

const FAKE_STUDENT_CODE = '990011223';
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// Rutas públicas que no devuelven datos de la base (o devuelven datos del propio cliente).
const SKIPPED_ROUTES = new Set<string>([
  'GET /auth/outlook-login',
  'GET /auth/callback',
  'GET /auth/verify-token',
]);

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
const models = new Map<string, DmmfModel>(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const enums = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));

function fakeScalar(model: string, field: DmmfModel['fields'][number]): unknown {
  if (field.kind === 'enum') return enums.get(field.type)?.[0];
  switch (field.type) {
    case 'String':
      if (/email|correo/i.test(field.name)) return `fuga.${model.toLowerCase()}@example.com`;
      if (/studentCode|codigo/i.test(field.name)) return FAKE_STUDENT_CODE;
      return 'texto';
    case 'Int':
    case 'BigInt':
    case 'Float':
    case 'Decimal':
      return 1;
    case 'Boolean':
      return true;
    case 'DateTime':
      return new Date('2026-01-01T00:00:00.000Z');
    case 'Json':
      return {};
    default:
      return null;
  }
}

// Arma una fila con la forma que Prisma devolvería para ese select/include.
function fakeRow(modelName: string, args: any = {}): any {
  const model = models.get(modelName);
  if (!model) return {};
  const select = args?.select;
  const include = args?.include;
  const row: Record<string, unknown> = {};

  for (const field of model.fields) {
    const wanted = select ? select[field.name] : field.kind !== 'object' || include?.[field.name];
    if (!wanted) continue;
    if (field.kind === 'object') {
      const nested = wanted === true ? {} : wanted;
      const value = fakeRow(field.type, nested);
      row[field.name] = field.isList ? [value] : value;
    } else {
      const value = fakeScalar(modelName, field);
      row[field.name] = field.isList ? [value] : value;
    }
  }

  const count = select?._count ?? include?._count;
  if (count) {
    const countSelect = count === true ? null : count.select;
    row._count = Object.fromEntries(
      model.fields
        .filter((f) => f.kind === 'object' && f.isList && (!countSelect || countSelect[f.name]))
        .map((f) => [f.name, 1]),
    );
  }
  return row;
}

function fakeDelegate(modelName: string) {
  const one = async (args?: any) => fakeRow(modelName, args);
  return {
    findMany: async (args?: any) => [fakeRow(modelName, args)],
    findFirst: one,
    findFirstOrThrow: one,
    findUnique: one,
    findUniqueOrThrow: one,
    create: one,
    update: one,
    upsert: one,
    delete: one,
    count: async () => 1,
    createMany: async () => ({ count: 1 }),
    updateMany: async () => ({ count: 1 }),
    deleteMany: async () => ({ count: 1 }),
    aggregate: async () => ({ _avg: {}, _sum: {}, _min: {}, _max: {}, _count: {} }),
    groupBy: async () => [],
  };
}

function fakePrisma(): any {
  const delegates = new Map<string, any>();
  const client: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') return undefined;
        if (prop === '$transaction') {
          return async (arg: any) => (typeof arg === 'function' ? arg(client) : Promise.all(arg));
        }
        if (prop === '$queryRaw' || prop === '$queryRawUnsafe') return async () => [];
        if (prop.startsWith('$')) return async () => 1;
        const modelName = prop.charAt(0).toUpperCase() + prop.slice(1);
        if (!models.has(modelName)) return undefined;
        if (!delegates.has(prop)) delegates.set(prop, fakeDelegate(modelName));
        return delegates.get(prop);
      },
    },
  );
  return client;
}

interface PublicRoute {
  key: string;
  url: string;
}

function findPublicGetRoutes(app: INestApplication): PublicRoute[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: PublicRoute[] = [];

  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance;
    if (!instance || !wrapper.metatype) continue;
    const prototype = Object.getPrototypeOf(instance);
    const base = String(Reflect.getMetadata(PATH_METADATA, wrapper.metatype) ?? '');

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName];
      if (Reflect.getMetadata(METHOD_METADATA, handler) !== RequestMethod.GET) continue;
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, wrapper.metatype]);
      if (!isPublic) continue;

      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const full = ('/' + [base, path].filter(Boolean).join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
      routes.push({ key: `GET ${full}`, url: full.replace(/:[A-Za-z0-9_]+/g, '1') });
    }
  }
  return routes;
}

describe('BG-02: rutas públicas sin datos personales', () => {
  let app: INestApplication;
  let routes: PublicRoute[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma())
      .overrideProvider(AzureStorageService)
      .useValue({
        getReadSasUrlById: async () => ({ url: 'https://blob.example/x', expiresAt: '2026-01-01' }),
        signReadUrlById: async () => ({ url: 'https://blob.example/x', expiresAt: '2026-01-01' }),
      })
      .overrideProvider(EmailService)
      .useValue({})
      .overrideProvider(RecaptchaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
    routes = findPublicGetRoutes(app).filter((r) => !SKIPPED_ROUTES.has(r.key));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('encuentra las rutas públicas de la aplicación', () => {
    expect(routes.map((r) => r.key)).toEqual(expect.arrayContaining(['GET /teams', 'GET /editions']));
  });

  it('ninguna ruta pública devuelve correos ni códigos estudiantiles', async () => {
    const leaks: string[] = [];
    for (const route of routes) {
      const res = await request(app.getHttpServer()).get(route.url);
      const body = res.text ?? '';
      // Una ruta que se cae no prueba nada: si el falso Prisma no le sirve, hay que ajustarlo.
      if (res.status >= 500) leaks.push(`${route.key} -> respondió ${res.status}`);
      const email = body.match(EMAIL_REGEX);
      if (email) leaks.push(`${route.key} -> correo ${email[0]}`);
      if (body.includes(FAKE_STUDENT_CODE)) leaks.push(`${route.key} -> código estudiantil`);
    }
    expect(leaks).toEqual([]);
  });

  it('la lista de equipos responde sin sesión, sin correos ni códigos', async () => {
    for (const url of ['/teams', '/teams?page=1&limit=10']) {
      const res = await request(app.getHttpServer()).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain('texto');
      expect(res.text).not.toMatch(EMAIL_REGEX);
      expect(res.text).not.toContain(FAKE_STUDENT_CODE);
    }
  });

  it('JuradosData y los integrantes del histórico exigen sesión', async () => {
    for (const url of [
      '/reports/JuradosData',
      '/reports/exportJurados',
      '/historicals/historical-members/1',
    ]) {
      const res = await request(app.getHttpServer()).get(url);
      expect(res.status).toBe(401);
    }
  });

  it('validate-emails tiene límite de peticiones', async () => {
    const { limit } = PUBLIC_LIMITS.validateEmails;
    const send = () => request(app.getHttpServer()).post('/teams/validate-emails').send({ emails: [] });
    for (let i = 0; i < limit; i++) {
      expect((await send()).status).not.toBe(429);
    }
    expect((await send()).status).toBe(429);
  });
});
