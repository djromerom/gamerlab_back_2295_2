import { InternalServerErrorException } from '@nestjs/common';
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

  it('si el envío falla para una cuenta existente, responde igual (el error solo se registra)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(confirmed);
    emailService.resendAuthEmailOfType.mockRejectedValueOnce(new InternalServerErrorException('boom'));
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const failed = await service.sendPublicAuthEmail('a@x.co', 'RESETEAR_CONTRASENA');
    const missing = await service.sendPublicAuthEmail('no@x.co', 'RESETEAR_CONTRASENA');
    expect(failed).toEqual(missing);
  });
});
