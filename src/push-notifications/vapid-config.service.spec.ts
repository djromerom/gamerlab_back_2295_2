import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { VapidConfigService } from './vapid-config.service';

jest.mock('web-push', () => ({ setVapidDetails: jest.fn() }));

const FAKE = {
  VAPID_PUBLIC_KEY: 'clave-publica-de-prueba',
  VAPID_PRIVATE_KEY: 'clave-privada-de-prueba',
  VAPID_SUBJECT: 'mailto:prueba@example.com',
};

const build = (env: Record<string, string | undefined>) =>
  new VapidConfigService({
    get: (name: string) => env[name],
  } as unknown as ConfigService);

describe('VapidConfigService (HU-37)', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('sin claves arranca sin fallar, queda desactivado y lo registra', () => {
    const service = build({});

    expect(() => service.onModuleInit()).not.toThrow();

    expect(service.isEnabled()).toBe(false);
    expect(service.getPublicKey()).toBeNull();
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).toContain('VAPID_PRIVATE_KEY');
  });

  it('con solo una parte de las claves queda desactivado y nombra lo que falta', () => {
    const service = build({ ...FAKE, VAPID_SUBJECT: '  ' });

    service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
    expect(JSON.stringify(warn.mock.calls)).toContain('VAPID_SUBJECT');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('VAPID_PUBLIC_KEY');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      FAKE.VAPID_PUBLIC_KEY,
    );
  });

  it('con claves mal formadas no tumba el arranque ni registra los valores', () => {
    (webpush.setVapidDetails as jest.Mock).mockImplementationOnce(() => {
      throw new Error(`clave no válida: ${FAKE.VAPID_PRIVATE_KEY}`);
    });
    const service = build(FAKE);

    expect(() => service.onModuleInit()).not.toThrow();

    expect(service.isEnabled()).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain(
      FAKE.VAPID_PRIVATE_KEY,
    );
  });

  it('con las tres variables queda activado', () => {
    const service = build(FAKE);

    service.onModuleInit();

    expect(service.isEnabled()).toBe(true);
    expect(service.getPublicKey()).toBe(FAKE.VAPID_PUBLIC_KEY);
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      FAKE.VAPID_SUBJECT,
      FAKE.VAPID_PUBLIC_KEY,
      FAKE.VAPID_PRIVATE_KEY,
    );
  });
});
