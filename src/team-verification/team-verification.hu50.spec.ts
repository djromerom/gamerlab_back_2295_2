/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamVerificationAction } from '@prisma/client';
import { TeamVerificationController } from './team-verification.controller';
import { TeamVerificationService } from './team-verification.service';
import { requiresVerificationCode } from './verification-rule';

/**
 * HU-50 (ARK-314): desactivar el código de verificación de un equipo o de todos.
 * Prisma simulado.
 */
const jurorId = 'juror-1';
const adminId = 'admin-1';

const withConfig = (verificationCodesEnabled: boolean) => ({
  status: 'ACTIVE',
  title: 'Feria',
  eventConfiguration: { verificationCodesEnabled },
});

const team = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  editionId: 1,
  teamCode: 'N10-ABC-1001',
  verificationCode: 'K7M2QX',
  verificationRequired: true,
  notGradable: false,
  assignedJurors: [{ id: jurorId }],
  verifications: [] as { id: number }[],
  edition: withConfig(true),
  ...overrides,
});

describe('requiresVerificationCode (HU-50)', () => {
  it('exige el código solo con el interruptor global y el del equipo activos', () => {
    expect(requiresVerificationCode(team())).toBe(true);
    expect(
      requiresVerificationCode(team({ verificationRequired: false })),
    ).toBe(false);
    expect(requiresVerificationCode(team({ edition: withConfig(false) }))).toBe(
      false,
    );
  });

  it('mantiene las reglas de antes: N0 y equipos sin código no lo piden', () => {
    expect(
      requiresVerificationCode(
        team({ teamCode: 'N0-COL-01', verificationCode: null }),
      ),
    ).toBe(false);
    expect(requiresVerificationCode(team({ verificationCode: null }))).toBe(
      false,
    );
  });

  it('sin configuración de la edición o sin la marca del equipo se exige (valor por defecto)', () => {
    expect(
      requiresVerificationCode(team({ edition: { eventConfiguration: null } })),
    ).toBe(true);
    expect(
      requiresVerificationCode({
        teamCode: 'N10-ABC-1001',
        verificationCode: 'K7M2QX',
      }),
    ).toBe(true);
  });
});

describe('TeamVerificationService (HU-50)', () => {
  const prisma = {
    team: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    videogame: { findMany: jest.fn() },
    teamVerification: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    teamVerificationLog: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  let service: TeamVerificationService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.resolve([]),
    );
    prisma.team.update.mockReturnValue('update');
    prisma.teamVerificationLog.create.mockReturnValue('log');
    service = new TeamVerificationService(prisma as any);
  });

  describe('el jurado califica sin código', () => {
    it.each([
      ['el equipo lo tiene desactivado', team({ verificationRequired: false })],
      [
        'el interruptor global está apagado',
        team({ edition: withConfig(false) }),
      ],
    ])('verify no lo pide si %s', async (_caso, row) => {
      prisma.team.findFirst.mockResolvedValue(row);

      await expect(
        service.verify(jurorId, { teamId: 10, code: '' }),
      ).resolves.toEqual({
        verified: true,
        required: false,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('la evaluación (individual y por lote) acepta el equipo con el código desactivado', async () => {
      prisma.videogame.findMany.mockResolvedValue([
        { id: 1, team: team({ verificationRequired: false }) },
        { id: 2, team: team({ id: 11 }) },
        { id: 3, team: team({ id: 12, edition: withConfig(false) }) },
      ]);

      const unverified = await service.findUnverifiedVideogameIds(
        jurorId,
        [1, 2, 3],
      );
      expect([...unverified]).toEqual([2]);

      prisma.videogame.findMany.mockResolvedValue([
        { id: 1, team: team({ verificationRequired: false }) },
      ]);
      await expect(service.assertVerified(jurorId, 1)).resolves.toBeUndefined();
    });

    it('con el código activo y sin verificar sigue respondiendo 403', async () => {
      prisma.videogame.findMany.mockResolvedValue([{ id: 2, team: team() }]);
      await expect(service.assertVerified(jurorId, 2)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('estado para el front', () => {
    it('required dice si hoy se pide el código; status no cambia de forma', async () => {
      prisma.team.findMany.mockResolvedValue([
        team({ id: 1 }),
        team({ id: 2, verificationRequired: false }),
        team({ id: 3, verifications: [{ id: 9 }] }),
      ]);

      await expect(
        service.getStatusWithRequired(jurorId, [1, 2, 3, 4]),
      ).resolves.toEqual({
        status: { 1: false, 2: true, 3: true, 4: false },
        required: { 1: true, 2: false, 3: true, 4: true },
      });
      await expect(service.getStatus(jurorId, [1, 2, 3, 4])).resolves.toEqual({
        1: false,
        2: true,
        3: true,
        4: false,
      });
    });

    it('con includeLocks=true el controlador agrega required a { status, locks }', async () => {
      const fake = {
        getStatus: jest.fn(),
        getStatusWithRequired: jest
          .fn()
          .mockResolvedValue({ status: { 1: true }, required: { 1: false } }),
        getLocks: jest
          .fn()
          .mockResolvedValue({ 1: { locked: false, lockedUntil: null } }),
      };
      const controller = new TeamVerificationController(fake as any);

      await expect(
        controller.getStatus({ teamIds: [1], includeLocks: true }, jurorId),
      ).resolves.toEqual({
        status: { 1: true },
        locks: { 1: { locked: false, lockedUntil: null } },
        required: { 1: false },
      });
      fake.getStatus.mockResolvedValue({ 1: true });
      await expect(
        controller.getStatus({ teamIds: [1] }, jurorId),
      ).resolves.toEqual({ 1: true });
    });
  });

  describe('interruptor por equipo', () => {
    it('desactivar guarda la marca y registra CODE_DISABLED con el administrador', async () => {
      prisma.team.findFirst.mockResolvedValue(team());

      await expect(service.setRequired(10, false, adminId)).resolves.toEqual({
        teamId: 10,
        verificationRequired: false,
        changed: true,
      });
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { verificationRequired: false },
      });
      expect(prisma.teamVerificationLog.create).toHaveBeenCalledWith({
        data: {
          action: TeamVerificationAction.CODE_DISABLED,
          teamId: 10,
          userId: adminId,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(['update', 'log']);
    });

    it('reactivar registra CODE_ENABLED y no regenera el código ni borra verificaciones', async () => {
      prisma.team.findFirst.mockResolvedValue(
        team({ verificationRequired: false }),
      );

      await service.setRequired(10, true, adminId);

      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { verificationRequired: true },
      });
      expect(prisma.teamVerificationLog.create).toHaveBeenCalledWith({
        data: {
          action: TeamVerificationAction.CODE_ENABLED,
          teamId: 10,
          userId: adminId,
        },
      });
      expect(prisma.teamVerification.create).not.toHaveBeenCalled();
    });

    it('repetir el mismo valor no cambia nada ni deja registro', async () => {
      prisma.team.findFirst.mockResolvedValue(
        team({ verificationRequired: false }),
      );

      await expect(service.setRequired(10, false, adminId)).resolves.toEqual({
        teamId: 10,
        verificationRequired: false,
        changed: false,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no cambia equipos de una edición cerrada, de colegios (N0) ni no calificables', async () => {
      prisma.team.findFirst.mockResolvedValueOnce(
        team({ edition: { status: 'INACTIVE', title: 'Feria 4' } }),
      );
      await expect(service.setRequired(10, false, adminId)).rejects.toThrow(
        /solo lectura/,
      );

      prisma.team.findFirst.mockResolvedValueOnce(
        team({ teamCode: 'N0-COL-01', verificationCode: null }),
      );
      await expect(
        service.setRequired(10, false, adminId),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.team.findFirst.mockResolvedValueOnce(team({ notGradable: true }));
      await expect(
        service.setRequired(10, false, adminId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
