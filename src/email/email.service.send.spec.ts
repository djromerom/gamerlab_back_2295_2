/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import { ServiceUnavailableException } from '@nestjs/common';
import { RestError } from '@azure/core-rest-pipeline';
import { EmailService } from './email.service';

// ARK-22: reintentos de ACS ante fallos transitorios y sin simular envíos fuera de desarrollo.
function build(env: Record<string, string>, beginSend?: jest.Mock) {
  const config = { get: jest.fn((key: string) => env[key]) };
  const service = new EmailService({} as any, {} as any, config as any);
  if (beginSend) {
    (service as any).emailClient = { beginSend };
    (service as any).senderAddress = 'no-reply@example.com';
  }
  return service;
}

const ok = { pollUntilDone: jest.fn().mockResolvedValue({ id: 'op-1', status: 'Succeeded' }) };
const restError = (statusCode: number) => new RestError(`HTTP ${statusCode}`, { statusCode });
const send = (service: EmailService) =>
  service.sendEmail('a@b.co', 'Asunto', 'verification', { firstName: 'Ana' });

describe('EmailService.sendEmail: reintentos de ACS (ARK-22)', () => {
  beforeEach(() => {
    // Sin esperas reales del backoff.
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as any;
    }) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('reintenta un 503 transitorio y termina enviando', async () => {
    const beginSend = jest.fn().mockRejectedValueOnce(restError(503)).mockResolvedValueOnce(ok);
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).resolves.toBeUndefined();
    expect(beginSend).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un error no transitorio (400)', async () => {
    const beginSend = jest.fn().mockRejectedValue(restError(400));
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(beginSend).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras 3 intentos con fallos transitorios', async () => {
    const beginSend = jest.fn().mockRejectedValue(restError(503));
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(beginSend).toHaveBeenCalledTimes(3);
  });

  it('sin credenciales de ACS fuera de desarrollo responde 503 y no simula el envío', async () => {
    await expect(send(build({ NODE_ENV: 'production' }))).rejects.toThrow(
      'El servicio de correo no está configurado.',
    );
  });

  it('sin credenciales de ACS en desarrollo sigue simulando el envío', async () => {
    await expect(send(build({ NODE_ENV: 'development' }))).resolves.toBeUndefined();
  });
});

describe('EmailService.sendEmail: cola y reintentos sin duplicar (BG-74)', () => {
  let waits: number[];

  beforeEach(() => {
    waits = [];
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms: number) => {
      waits.push(ms);
      fn();
      return 0 as any;
    }) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  /** 429 de ACS con sus cabeceras. */
  const throttled = (headers: Record<string, string>) =>
    new RestError('HTTP 429', {
      statusCode: 429,
      response: { headers: { get: (name: string) => headers[name] } } as never,
    });
  /** beginSend que acepta el correo (202 del POST) y devuelve `poller`. */
  const accepts = (poller: unknown) =>
    jest.fn((_message: unknown, options?: { onResponse?: (response: unknown) => void }) => {
      options?.onResponse?.({ request: { method: 'POST' }, status: 202 });
      return Promise.resolve(poller);
    });

  it('ante un 429 espera lo que pide Retry-After (no el backoff de 1 s)', async () => {
    const beginSend = jest
      .fn()
      .mockRejectedValueOnce(throttled({ 'retry-after': '5' }))
      .mockResolvedValueOnce(ok);
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).resolves.toBeUndefined();
    expect(beginSend).toHaveBeenCalledTimes(2);
    expect(waits).toContain(5_000);
    expect(waits).not.toContain(1_000);
  });

  it('si ACS pide esperar más de un minuto falla ya con RATE_LIMIT_EXCEEDED y el tiempo pedido', async () => {
    const beginSend = jest.fn().mockRejectedValue(throttled({ 'retry-after': '1800' }));
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).rejects.toThrow(
      'RATE_LIMIT_EXCEEDED (ACS pide esperar 1800 s)',
    );
    expect(beginSend).toHaveBeenCalledTimes(1);
  });

  it('si ACS ya aceptó el correo y la confirmación se corta, no lo vuelve a enviar', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const beginSend = accepts({ pollUntilDone: jest.fn().mockRejectedValue(abort) });
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).resolves.toBeUndefined();
    expect(beginSend).toHaveBeenCalledTimes(1);
  });

  it('un timeout antes de que ACS acepte sí se reintenta, con el mismo Operation-Id', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const beginSend = jest.fn().mockRejectedValueOnce(abort).mockResolvedValueOnce(ok);
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).resolves.toBeUndefined();
    expect(beginSend).toHaveBeenCalledTimes(2);
    const ids = beginSend.mock.calls.map((call) => (call[1] as { operationId: string }).operationId);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[1]).toBe(ids[0]);
  });

  it('un estado final Failed no se reintenta', async () => {
    const beginSend = accepts({
      pollUntilDone: jest.fn().mockResolvedValue({ id: 'op-9', status: 'Failed' }),
    });
    await expect(send(build({ NODE_ENV: 'production' }, beginSend))).rejects.toThrow(
      'ACS terminó con estado: Failed',
    );
    expect(beginSend).toHaveBeenCalledTimes(1);
  });

  it('varios correos a la vez salen de a uno, con la pausa del dominio propio (2 s)', async () => {
    const log: string[] = [];
    let release!: () => void;
    const slow = {
      pollUntilDone: jest.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ id: 'op-1', status: 'Succeeded' });
          }),
      ),
    };
    const beginSend = jest
      .fn()
      .mockImplementationOnce(() => {
        log.push('envío 1');
        return Promise.resolve(slow);
      })
      .mockImplementationOnce(() => {
        log.push('envío 2');
        return Promise.resolve(ok);
      });
    const service = build({ NODE_ENV: 'production' }, beginSend);

    const first = send(service);
    const second = send(service);
    await new Promise(setImmediate);
    expect(log).toEqual(['envío 1']);

    release();
    await Promise.all([first, second]);
    expect(log).toEqual(['envío 1', 'envío 2']);
    expect(waits).toContain(2_000);
  });

  it('con remitente de Azure (azurecomm.net) la pausa es de 12 s; ACS_MIN_INTERVAL_MS la cambia', async () => {
    const twoSends = async (env: Record<string, string>) => {
      waits = [];
      const service = build(env, jest.fn().mockResolvedValue(ok));
      (service as any).senderAddress = 'DoNotReply@abc.azurecomm.net';
      await Promise.all([send(service), send(service)]);
      return waits;
    };
    expect(await twoSends({ NODE_ENV: 'production' })).toContain(12_000);
    expect(await twoSends({ NODE_ENV: 'production', ACS_MIN_INTERVAL_MS: '500' })).toContain(500);
  });
});
