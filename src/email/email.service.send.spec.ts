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
