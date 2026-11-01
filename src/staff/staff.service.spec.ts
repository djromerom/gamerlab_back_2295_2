import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

jest.setTimeout(30000);

const dto = {
  email: 'ana@uninorte.edu.co',
  firstName: ' Ana ',
  lastName: 'Pérez',
};

/** Primer argumento de una llamada a un mock, tipado. */
const callArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as unknown[][])[call][0] as T;

describe('StaffService', () => {
  let service: StaffService;
  const tx = { user: { update: jest.fn() } };
  const prisma = {
    role: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const auth = {
    registerUserTransaction: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.role.findFirst.mockResolvedValue({ id: 5 });
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    auth.registerUserTransaction.mockResolvedValue({
      user: { id: 'u-1', email: dto.email },
      verificationToken: 'verif-1',
    });
    auth.sendVerificationEmail.mockResolvedValue({ message: 'ok' });
    tx.user.update.mockResolvedValue({
      id: 'u-1',
      email: dto.email,
      firstName: 'Ana',
      lastName: 'Pérez',
    });
    const module = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    service = module.get(StaffService);
  });

  it('crea la cuenta con el rol Staff dentro de la transacción y envía la verificación', async () => {
    const result = await service.create(dto);

    expect(callArg<{ email: string }>(auth.registerUserTransaction)).toEqual({
      email: dto.email,
    });
    expect(callArg<{ data: unknown }>(tx.user.update).data).toEqual({
      firstName: 'Ana',
      lastName: 'Pérez',
      roleId: 5,
      isActive: true,
      lastSignInAt: null,
    });
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith(
      dto.email,
      'verif-1',
    );
    expect(result).toEqual({
      id: 'u-1',
      email: dto.email,
      firstName: 'Ana',
      lastName: 'Pérez',
      role: 'Staff',
    });
  });

  it('un correo repetido responde 409 y no envía correo', async () => {
    auth.registerUserTransaction.mockRejectedValue(
      new ConflictException('A user with that email already exists'),
    );

    await expect(service.create(dto)).rejects.toThrow(
      'Ya existe un usuario con ese correo',
    );
    expect(auth.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('si falta el rol Staff (migración sin aplicar) no crea nada', async () => {
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('si el correo de verificación falla, la cuenta igual queda creada', async () => {
    auth.sendVerificationEmail.mockRejectedValue(new Error('ACS caído'));

    await expect(service.create(dto)).resolves.toMatchObject({ id: 'u-1' });
  });
});

describe('StaffController (permisos)', () => {
  it('exige RolePermissionGuard y el servicio ManageStaffAccounts', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      StaffController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
    expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, StaffController)).toBe(
      'ManageStaffAccounts',
    );
  });
});
