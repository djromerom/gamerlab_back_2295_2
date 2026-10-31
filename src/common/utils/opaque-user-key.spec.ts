import { getSocketKeySecret, opaqueUserKey } from './opaque-user-key';

describe('opaqueUserKey', () => {
  const secret = 'secreto-de-prueba';
  const uuidA = '0588fbb6-534f-4e85-a37f-ca090b9a3059';
  const uuidB = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

  it('es estable por usuario, de 16 hex y no contiene el UUID', () => {
    const key = opaqueUserKey(uuidA, secret);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(opaqueUserKey(uuidA, secret)).toBe(key);
    expect(key).not.toContain(uuidA);
  });

  it('es distinta entre usuarios y entre secretos', () => {
    expect(opaqueUserKey(uuidA, secret)).not.toBe(opaqueUserKey(uuidB, secret));
    expect(opaqueUserKey(uuidA, secret)).not.toBe(opaqueUserKey(uuidA, 'otro'));
  });
});

describe('getSocketKeySecret', () => {
  it('devuelve el secreto configurado', () => {
    expect(getSocketKeySecret({ SOCKET_KEY_SECRET: 'abc', NODE_ENV: 'production' })).toBe('abc');
  });

  it('en producción sin SOCKET_KEY_SECRET falla con un mensaje claro', () => {
    expect(() => getSocketKeySecret({ NODE_ENV: 'production' })).toThrow(/SOCKET_KEY_SECRET/);
  });

  it('fuera de producción usa un valor de desarrollo', () => {
    expect(getSocketKeySecret({ NODE_ENV: 'development' })).toEqual(expect.any(String));
    expect(getSocketKeySecret({})).not.toBe('');
  });
});
