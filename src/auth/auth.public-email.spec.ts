import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service';

/*
 ARK-SP1 (#7, U4): reset-password y resend-confirmation responden igual exista o no el correo
 (mismo cuerpo), y solo envían correo si la cuenta existe y corresponde.
*/
describe('AuthService.sendPublicAuthEmail', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const emailService = { resendAuthEmailOfType: jest.fn() };
  const configService = { get: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService.resendAuthEmailOfType.mockResolvedValue({ message: 'enviado' });
    service = new AuthService(prisma as any, configService as any, {} as any, {} as any, {} as any, emailService as any);
  });

  const confirmed = { email: 'a@x.co', confirmationStatus: { status: 'CONFIRMADO' } };
  const pending = { email: 'a@x.co', confirmationStatus: { status: 'PENDIENTE' } };

  it('reset-password: mismo cuerpo exista o no el correo, y solo envía si existe', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(confirmed);
    const existing = await service.sendPublicAuthEmail('a@x.co', 'RESETEAR_CONTRASENA');
    expect(emailService.resendAuthEmailOfType).toHaveBeenCalledTimes(1);

    prisma.user.findUnique.mockResolvedValueOnce(null);
    const missing = await service.sendPublicAuthEmail('no@x.co', 'RESETEAR_CONTRASENA');
    expect(emailService.resendAuthEmailOfType).toHaveBeenCalledTimes(1);
    expect(missing).toEqual(existing);
  });

  it('resend-confirmation: mismo cuerpo para pendiente, ya verificado e inexistente; solo envía al pendiente', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(pending);
    const a = await service.sendPublicAuthEmail('a@x.co', 'VERIFICACION_EMAIL');
    expect(emailService.resendAuthEmailOfType).toHaveBeenCalledTimes(1);

    prisma.user.findUnique.mockResolvedValueOnce(confirmed);
    const b = await service.sendPublicAuthEmail('a@x.co', 'VERIFICACION_EMAIL');
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const c = await service.sendPublicAuthEmail('no@x.co', 'VERIFICACION_EMAIL');
    expect(emailService.resendAuthEmailOfType).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('la respuesta no espera el envío (no hay filtración por tiempo)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(confirmed);
    emailService.resendAuthEmailOfType.mockReturnValueOnce(new Promise(() => undefined));
    const result = await service.sendPublicAuthEmail('a@x.co', 'RESETEAR_CONTRASENA');
    expect(result).toBeDefined();
    expect(emailService.resendAuthEmailOfType).toHaveBeenCalledTimes(1);
  });

  it('un rechazo del envío en segundo plano se registra sin excepción no controlada', async () => {
    const errorSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'error').mockImplementation(() => undefined);
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    prisma.user.findUnique.mockResolvedValueOnce(confirmed);
    emailService.resendAuthEmailOfType.mockRejectedValueOnce(new ServiceUnavailableException('RATE_LIMIT_EXCEEDED'));
    const result = await service.sendPublicAuthEmail('a@x.co', 'RESETEAR_CONTRASENA');
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);
    expect(typeof result.message).toBe('string');
    expect(unhandled).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).not.toContain('a@x.co');
    expect(String(errorSpy.mock.calls[0][0])).toContain('RATE_LIMIT_EXCEEDED');
  });
});
