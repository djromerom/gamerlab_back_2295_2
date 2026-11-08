import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import {
  EMAIL_CONFIRMATION_MISMATCH,
  EMAIL_IN_USE_BY_OTHER_ROLE,
  EXTERNAL_PRESENTER_ALREADY_REGISTERED,
  EXTERNAL_PRESENTER_READ_ONLY,
  ExternalPresentersService,
} from './external-presenters.service';

/** HU-33 (ARK-194): reglas del alta y de la edición de presentadores con la BD simulada. */
describe('ExternalPresentersService (HU-33)', () => {
  const ADMIN = 'admin-1';
  const PRESENTER_ROLE = 6;
  const edition = {
    id: 7,
    title: 'Feria',
    status: EditionStatus.ACTIVE,
    year: 2026,
    semester: 30,
  };
  const dto = {
    email: 'ana@empresa.com',
    confirmEmail: 'ana@empresa.com',
    firstName: 'Ana',
    lastName: 'Pérez',
    organization: 'Estudio',
  };
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 'u-1',
    editionId: 7,
    organization: 'Estudio',
    presentationTitle: null,
    certificateSentAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedById: ADMIN,
    user: {
      id: 'u-1',
      email: dto.email,
      firstName: 'Ana',
      lastName: 'Pérez',
      lastSignInAt: null,
    },
    edition: { id: 7, title: 'Feria', status: EditionStatus.ACTIVE },
    ...over,
  });

  function setup() {
    const tx: any = {
      user: { update: jest.fn() },
      externalPresenter: {
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row()),
      },
    };
    const prisma: any = {
      edition: { findFirst: jest.fn().mockResolvedValue(edition) },
      role: { findFirst: jest.fn().mockResolvedValue({ id: PRESENTER_ROLE }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      externalPresenter: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row()]),
        update: jest.fn().mockResolvedValue(row()),
      },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    const auth: any = {
      registerUserTransaction: jest
        .fn()
        .mockResolvedValue({
          user: { id: 'u-1', email: dto.email },
          verificationToken: 'tok',
        }),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new ExternalPresentersService(prisma, auth),
      prisma,
      tx,
      auth,
    };
  }

  describe('create', () => {
    it('cuenta nueva: rol de presentador, fila de la edición activa y correo de verificación', async () => {
      const { service, tx, auth } = setup();
      const view = await service.create(dto, ADMIN);

      expect(auth.registerUserTransaction).toHaveBeenCalledWith(
        { email: dto.email },
        tx,
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          roleId: PRESENTER_ROLE,
          firstName: 'Ana',
          lastName: 'Pérez',
        }),
      });
      expect(tx.externalPresenter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: 'u-1',
            editionId: 7,
            organization: 'Estudio',
            presentationTitle: null,
            updatedById: ADMIN,
          },
        }),
      );
      expect(auth.sendVerificationEmail).toHaveBeenCalledWith(dto.email, 'tok');
      expect(view).toMatchObject({
        id: 1,
        email: dto.email,
        organization: 'Estudio',
      });
    });

    it('los correos no coinciden: 400 EMAIL_CONFIRMATION_MISMATCH sin crear nada', async () => {
      const { service, auth } = setup();
      const error = await service
        .create({ ...dto, confirmEmail: 'otra@empresa.com' }, ADMIN)
        .catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse().code).toBe(EMAIL_CONFIRMATION_MISMATCH);
      expect(auth.registerUserTransaction).not.toHaveBeenCalled();
    });

    it('mayúsculas y espacios no cuentan como diferencia', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...dto, confirmEmail: ' ANA@Empresa.com ' }, ADMIN),
      ).resolves.toBeDefined();
    });

    it('correo de una cuenta con otro rol: 409 EMAIL_IN_USE_BY_OTHER_ROLE', async () => {
      const { service, prisma, auth } = setup();
      prisma.user.findMany.mockResolvedValue([
        { id: 'x', roleId: 2, role: { name: 'Estudiante' } },
      ]);
      const error = await service.create(dto, ADMIN).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: EMAIL_IN_USE_BY_OTHER_ROLE,
      });
      expect(error.getResponse().message).toContain('Estudiante');
      expect(auth.registerUserTransaction).not.toHaveBeenCalled();
    });

    it('un presentador de otra edición se registra en la activa sin crear otra cuenta', async () => {
      const { service, prisma, tx, auth } = setup();
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          roleId: PRESENTER_ROLE,
          role: { name: 'Presentador externo' },
        },
      ]);
      await service.create(dto, ADMIN);
      expect(auth.registerUserTransaction).not.toHaveBeenCalled();
      expect(tx.externalPresenter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u-1', editionId: 7 }),
        }),
      );
    });

    it('si lo habían quitado de la edición activa, lo reactiva', async () => {
      const { service, prisma, tx } = setup();
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          roleId: PRESENTER_ROLE,
          role: { name: 'Presentador externo' },
        },
      ]);
      prisma.externalPresenter.findUnique.mockResolvedValue({
        id: 1,
        isActive: false,
      });
      await service.create(dto, ADMIN);
      expect(tx.externalPresenter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            isActive: true,
            certificateSentAt: null,
          }),
        }),
      );
    });

    it('ya registrado en la edición activa: 409 EXTERNAL_PRESENTER_ALREADY_REGISTERED', async () => {
      const { service, prisma } = setup();
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          roleId: PRESENTER_ROLE,
          role: { name: 'Presentador externo' },
        },
      ]);
      prisma.externalPresenter.findUnique.mockResolvedValue({
        id: 1,
        isActive: true,
      });
      const error = await service.create(dto, ADMIN).catch((e) => e);
      expect(error.getResponse().code).toBe(
        EXTERNAL_PRESENTER_ALREADY_REGISTERED,
      );
    });

    it('sin edición activa: 404', async () => {
      const { service, prisma } = setup();
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(service.create(dto, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createMany', () => {
    it('procesa cada fila por separado e informa las que fallan', async () => {
      const { service, prisma } = setup();
      prisma.user.findMany
        .mockResolvedValueOnce([]) // ana: nueva
        .mockResolvedValueOnce([
          { id: 'x', roleId: 4, role: { name: 'Jurado' } },
        ]); // luis: es jurado
      const result = await service.createMany(
        [
          dto,
          { ...dto, email: 'luis@x.co', confirmEmail: 'luis@x.co' },
          { ...dto, email: 'ANA@empresa.com', confirmEmail: 'ana@empresa.com' },
          { ...dto, email: 'eva@x.co', confirmEmail: 'otra@x.co' },
        ],
        ADMIN,
      );
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toEqual([
        expect.objectContaining({
          email: 'luis@x.co',
          code: EMAIL_IN_USE_BY_OTHER_ROLE,
        }),
        expect.objectContaining({
          email: 'ana@empresa.com',
          code: 'DUPLICATED_IN_BATCH',
        }),
        expect.objectContaining({
          email: 'eva@x.co',
          code: EMAIL_CONFIRMATION_MISMATCH,
        }),
      ]);
    });

    it('un error inesperado (BD caída) no se esconde como fila fallida', async () => {
      const { service, prisma } = setup();
      prisma.user.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.createMany([dto], ADMIN)).rejects.toThrow('db down');
    });
  });

  describe('update y remove', () => {
    it('edita nombre y datos del certificado; null borra la organización', async () => {
      const { service, tx } = setup();
      await service.update(
        1,
        { firstName: 'Anita', organization: null as any },
        ADMIN,
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { firstName: 'Anita' },
      });
      expect(tx.externalPresenter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { organization: null, updatedById: ADMIN },
        }),
      );
    });

    it('un presentador de una edición anterior es de solo lectura (400)', async () => {
      const { service, prisma } = setup();
      prisma.externalPresenter.findFirst.mockResolvedValue(
        row({
          edition: {
            id: 5,
            title: 'Feria vieja',
            status: EditionStatus.ARCHIVED,
          },
        }),
      );
      const error = await service.remove(1, ADMIN).catch((e) => e);
      expect(error.getResponse().code).toBe(EXTERNAL_PRESENTER_READ_ONLY);
      expect(prisma.externalPresenter.update).not.toHaveBeenCalled();
    });

    it('quitar es borrado lógico de la fila; la cuenta no se toca', async () => {
      const { service, prisma } = setup();
      expect(await service.remove(1, ADMIN)).toEqual({ removed: true });
      expect(prisma.externalPresenter.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false, updatedById: ADMIN },
      });
    });

    it('inexistente o ya quitado: 404', async () => {
      const { service, prisma } = setup();
      prisma.externalPresenter.findFirst.mockResolvedValue(null);
      await expect(service.remove(9, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('me', () => {
    it('su registro en la edición activa', async () => {
      const { service, prisma } = setup();
      prisma.externalPresenter.findMany.mockResolvedValue([
        row({
          id: 3,
          editionId: 9,
          edition: { id: 9, title: 'Otra', status: 'INACTIVE' },
        }),
        row(),
      ]);
      expect(await service.me('u-1')).toMatchObject({
        id: 1,
        edition: { id: 7, title: 'Feria' },
      });
    });

    it('sin registro activo: 404', async () => {
      const { service, prisma } = setup();
      prisma.externalPresenter.findMany.mockResolvedValue([]);
      await expect(service.me('u-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
