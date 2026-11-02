import { VideogamesGateway } from './videogames.gateway';
import { opaqueUserKey } from '../common/utils/opaque-user-key';

describe('VideogamesGateway.emitLikesUpdate (ids opacos)', () => {
  const secret = 'secreto-de-prueba';
  const uuidA = '0588fbb6-534f-4e85-a37f-ca090b9a3059';
  const uuidB = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  const emit = jest.fn();
  let gateway: VideogamesGateway;

  beforeEach(() => {
    process.env.SOCKET_KEY_SECRET = secret;
    emit.mockReset();
    gateway = new VideogamesGateway();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;
  });

  it('agrega triggerKey estable por usuario y sin el UUID', () => {
    gateway.emitLikesUpdate(1, 5, uuidA, true);
    gateway.emitLikesUpdate(1, 6, uuidA, false);
    gateway.emitLikesUpdate(1, 7, uuidB, true);
    const [a1, a2, b] = emit.mock.calls.map((c) => c[1]);
    expect(a1.triggerKey).toBe(opaqueUserKey(uuidA, secret));
    expect(a2.triggerKey).toBe(a1.triggerKey);
    expect(b.triggerKey).not.toBe(a1.triggerKey);
    expect(a1.triggerKey).not.toContain(uuidA);
  });

  it('en este despliegue conserva triggerUserId (se quita en el segundo PR)', () => {
    gateway.emitLikesUpdate(1, 5, uuidA, true);
    expect(emit.mock.calls[0][1]).toMatchObject({ videogameId: 1, likeCount: 5, liked: true, triggerUserId: uuidA });
  });
});

describe('VideogamesGateway.onModuleInit (arranque)', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('en producción sin SOCKET_KEY_SECRET lanza al arrancar', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SOCKET_KEY_SECRET;
    expect(() => new VideogamesGateway().onModuleInit()).toThrow(/SOCKET_KEY_SECRET/);
  });

  it('con la variable, o fuera de producción, no lanza', () => {
    process.env.NODE_ENV = 'production';
    process.env.SOCKET_KEY_SECRET = 'abc';
    expect(() => new VideogamesGateway().onModuleInit()).not.toThrow();
    process.env.NODE_ENV = 'development';
    delete process.env.SOCKET_KEY_SECRET;
    expect(() => new VideogamesGateway().onModuleInit()).not.toThrow();
  });
});
