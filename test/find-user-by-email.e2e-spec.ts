import {
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import {
  findUserByEmailCaseInsensitive,
  findUsersByEmailCaseInsensitive,
} from '../src/common/utils/find-user-by-email';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * C1 contra PostgreSQL real: Prisma traduce `equals` + `mode: 'insensitive'` a ILIKE, así que
 * solo la BD de verdad demuestra que `_` y `%` del correo no actúan como comodines.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (rol "Estudiante", tipos de token). Crea sus usuarios y los borra al final.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('Búsqueda de usuario por correo (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const runId = Date.now().toString(36);
  const domain = `it-${runId}.edu.co`;
  const jdiaz = `jdiaz@${domain}`;
  const juan = `juan.perez@${domain}`;
  // Creados antes de normalizar: solo difieren en mayúsculas
  const anaA = `Ana@${domain}`;
  const anaB = `ANA@${domain}`;
  const config: any = { get: (_key: string, fallback?: unknown) => fallback };
  const emailService = new EmailService(
    prisma as unknown as PrismaService,
    {} as any,
    config,
  );
  const authService = new AuthService(
    prisma as unknown as PrismaService,
    config,
    {} as any,
    new JwtService({ secret: 'it-secret' }),
    {} as any,
    emailService,
  );
  let sendEmail: jest.SpyInstance;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'Estudiante' },
    });
    const password = await bcrypt.hash('Pass1234', 4);
    await prisma.user.createMany({
      data: [jdiaz, juan, anaA, anaB].map((email, i) => ({
        id: `it-c1-${runId}-${i}`,
        email,
        roleId: role.id,
        firstName: 'IT',
        lastName: 'C1',
        password,
        authMethod: 'PASSWORD' as const,
        isActive: true,
      })),
    });
    await emailService.onModuleInit();
    sendEmail = jest
      .spyOn(emailService, 'sendEmail')
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.verificationToken.deleteMany({
      where: { email: { endsWith: domain } },
    });
    await prisma.user.deleteMany({
      where: { id: { startsWith: `it-c1-${runId}` } },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => sendEmail.mockClear());

  it('_ y % no son comodines; las mayúsculas no importan', async () => {
    expect(
      await findUserByEmailCaseInsensitive(prisma, `j_iaz@${domain}`),
    ).toBeNull();
    expect(
      await findUserByEmailCaseInsensitive(prisma, `%@${domain}`),
    ).toBeNull();
    expect(
      await findUsersByEmailCaseInsensitive(prisma, `%@${domain}`),
    ).toHaveLength(0);
    expect(
      await findUserByEmailCaseInsensitive(prisma, `j%@${domain}`),
    ).toBeNull();
    expect(
      (
        await findUserByEmailCaseInsensitive(
          prisma,
          `JUAN.PEREZ@${domain.toUpperCase()}`,
        )
      )?.email,
    ).toBe(juan);
  });

  it('equivalentes por mayúsculas: gana la exacta; sin exacta, ninguno', async () => {
    expect((await findUserByEmailCaseInsensitive(prisma, anaB))?.email).toBe(
      anaB,
    );
    expect(
      await findUserByEmailCaseInsensitive(prisma, `ana@${domain}`),
    ).toBeNull();
    expect(
      await findUsersByEmailCaseInsensitive(prisma, `ana@${domain}`),
    ).toHaveLength(2);
  });

  it('login: un correo-patrón no entra en la cuenta que coincide por comodín', async () => {
    const res: any = { cookie: jest.fn(), clearCookie: jest.fn() };
    await expect(
      authService.login(
        { email: `j_iaz@${domain}`, password: 'Pass1234' },
        'PASSWORD',
        res,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('reset-password con el correo de otro usuario por patrón no crea token ni envía', async () => {
    await expect(
      emailService.resendAuthEmailOfType(
        `juan_perez@${domain}`,
        'RESETEAR_CONTRASENA',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(
      await prisma.verificationToken.count({ where: { email: juan } }),
    ).toBe(0);
  });

  it('reset-password con otra capitalización envía al correo guardado', async () => {
    await emailService.resendAuthEmailOfType(
      juan.toUpperCase(),
      'RESETEAR_CONTRASENA',
    );
    expect(sendEmail).toHaveBeenCalledWith(
      juan,
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
    expect(
      await prisma.verificationToken.count({ where: { email: juan } }),
    ).toBe(1);
  });
});
