/* eslint-disable @typescript-eslint/require-await */
import { Logger, NotFoundException } from '@nestjs/common';
import { matchesPrismaEmailFilter } from '../../test/helpers/postgres-ilike';
import { EmailService } from './email.service';

/**
 * C1: recuperar contraseña no debe tratar el correo como patrón ILIKE, y el enlace va SIEMPRE
 * al correo guardado del usuario encontrado, nunca al que llegó en la petición.
 */
describe('EmailService.resendAuthEmailOfType (correo sin comodines)', () => {
  const users = [
    {
      id: 'victim',
      email: 'juan.perez@outlook.com',
      firstName: 'Juan',
      lastName: 'Pérez',
      confirmationStatus: { status: 'CONFIRMADO' },
    },
  ];
  let prisma: any;
  let service: EmailService;
  let sendEmail: jest.SpyInstance;

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    const filter = ({ where }: any) =>
      users.filter((u) => matchesPrismaEmailFilter(u.email, where.email));
    prisma = {
      user: {
        findFirst: jest.fn(async (args) => filter(args)[0] ?? null),
        findMany: jest.fn(async (args) => filter(args)),
        findUnique: jest.fn(
          async ({ where }) =>
            users.find((u) => u.email === where.email) ?? null,
        ),
      },
      verificationToken: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }) => data),
      },
    };
    const config: any = { get: (_key: string, fallback?: unknown) => fallback };
    service = new EmailService(prisma, {} as any, config);
    Object.assign(service as any, {
      verificationTokenId: 1,
      resetPasswordTokenId: 2,
    });
    sendEmail = jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
  });

  it.each(['juan_perez@outlook.com', '%@outlook.com', 'juan%@outlook.com'])(
    'reset con %s (patrón que coincide con otra cuenta) no crea token ni envía',
    async (email) => {
      await expect(
        service.resendAuthEmailOfType(email, 'RESETEAR_CONTRASENA'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    },
  );

  it('reset con otra capitalización envía al correo guardado del usuario', async () => {
    await service.resendAuthEmailOfType(
      'JUAN.PEREZ@OUTLOOK.COM',
      'RESETEAR_CONTRASENA',
    );

    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'victim' }),
    });
    expect(sendEmail).toHaveBeenCalledWith(
      'juan.perez@outlook.com',
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
  });
});
