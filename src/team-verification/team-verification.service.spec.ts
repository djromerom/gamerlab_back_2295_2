import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { TeamVerificationAction } from '@prisma/client';
import {
  MAX_FAILED_ATTEMPTS,
  TeamVerificationService,
} from './team-verification.service';
import {
  isCollegeTeamCode,
  randomVerificationCode,
} from './verification-code.util';

describe('TeamVerificationService', () => {
  let service: TeamVerificationService;

  const jurorId = 'juror-1';
  const adminId = 'admin-1';

  const prismaMock = {
    team: { findFirst: jest.fn(), update: jest.fn() },
    videogame: { findMany: jest.fn() },
    teamVerification: { findUnique: jest.fn(), upsert: jest.fn() },
    teamVerificationLog: { create: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  const universityTeam = {
    id: 10,
    editionId: 1,
    teamCode: 'N10-ABC-1001',
    verificationCode: 'K7M2QX',
    assignedJurors: [{ id: jurorId }],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockResolvedValue([]);
    service = new TeamVerificationService(prismaMock as any);
  });

  describe('verify', () => {
    const dto = { teamId: 10, code: 'K7M2QX' };

    it('guarda la verificación cuando el código coincide', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.count.mockResolvedValue(0);

      const result = await service.verify(jurorId, dto);

      expect(result).toEqual({ verified: true, required: true });
      expect(prismaMock.teamVerification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { teamId: 10, jurorId },
        }),
      );
      expect(prismaMock.teamVerificationLog.create).toHaveBeenCalledWith({
        data: {
          action: TeamVerificationAction.ATTEMPT_SUCCESS,
          teamId: 10,
          userId: jurorId,
        },
      });
    });

    it('rechaza un código incorrecto, lo registra e indica los intentos restantes', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.count.mockResolvedValue(1);

      await expect(
        service.verify(jurorId, { teamId: 10, code: 'ZZZZZZ' }),
      ).rejects.toThrow(/Intentos restantes: 3/);

      expect(prismaMock.teamVerificationLog.create).toHaveBeenCalledWith({
        data: {
          action: TeamVerificationAction.ATTEMPT_FAILED,
          teamId: 10,
          userId: jurorId,
        },
      });
      expect(prismaMock.teamVerification.upsert).not.toHaveBeenCalled();
    });

    it('bloquea con 429 tras el máximo de intentos fallidos sin comparar el código', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.count.mockResolvedValue(
        MAX_FAILED_ATTEMPTS,
      );

      const error: unknown = await service
        .verify(jurorId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(prismaMock.teamVerificationLog.create).not.toHaveBeenCalled();
    });

    it('no vuelve a pedir el código si el jurado ya verificó el grupo', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.verify(jurorId, {
        teamId: 10,
        code: 'ZZZZZZ',
      });

      expect(result).toEqual({ verified: true, required: true });
      expect(prismaMock.teamVerificationLog.count).not.toHaveBeenCalled();
    });

    it('rechaza con 403 si el grupo no está asignado al jurado', async () => {
      prismaMock.team.findFirst.mockResolvedValue({
        ...universityTeam,
        assignedJurors: [],
      });

      await expect(service.verify(jurorId, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('no exige código en equipos de colegios (N0)', async () => {
      prismaMock.team.findFirst.mockResolvedValue({
        ...universityTeam,
        teamCode: 'N0-ABC-001',
        verificationCode: null,
        assignedJurors: [],
      });

      await expect(service.verify(jurorId, dto)).resolves.toEqual({
        verified: true,
        required: false,
      });
    });

    it('responde 404 si el equipo no existe en la edición activa', async () => {
      prismaMock.team.findFirst.mockResolvedValue(null);

      await expect(service.verify(jurorId, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findUnverifiedVideogameIds', () => {
    it('devuelve solo los juegos con código requerido y sin verificación del jurado', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        {
          id: 1,
          team: { ...universityTeam, verifications: [] },
        },
        {
          id: 2,
          team: { ...universityTeam, verifications: [{ id: 5 }] },
        },
        {
          id: 3,
          team: {
            ...universityTeam,
            teamCode: 'N0-ABC-001',
            verificationCode: null,
            verifications: [],
          },
        },
      ]);

      const result = await service.findUnverifiedVideogameIds(
        jurorId,
        [1, 2, 3],
      );

      expect([...result]).toEqual([1]);
      expect(prismaMock.videogame.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('assertVerified', () => {
    it('lanza 403 si el grupo no está verificado', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        { id: 1, team: { ...universityTeam, verifications: [] } },
      ]);

      await expect(service.assertVerified(jurorId, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('administración', () => {
    it('regenerar guarda un código nuevo y lo registra con el administrador', async () => {
      prismaMock.team.findFirst
        .mockResolvedValueOnce(universityTeam) // findTeamForAdmin
        .mockResolvedValueOnce(null); // el código generado no está en uso

      const result = await service.regenerate(10, adminId);

      expect(result.teamId).toBe(10);
      expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(prismaMock.teamVerificationLog.create).toHaveBeenCalledWith({
        data: {
          action: TeamVerificationAction.CODE_REGENERATED,
          teamId: 10,
          userId: adminId,
        },
      });
    });

    it('consultar registra la consulta del administrador', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);

      const result = await service.getCodeForAdmin(10, adminId);

      expect(result).toEqual({ teamId: 10, code: 'K7M2QX' });
      expect(prismaMock.teamVerificationLog.create).toHaveBeenCalledWith({
        data: {
          action: TeamVerificationAction.CODE_VIEWED,
          teamId: 10,
          userId: adminId,
        },
      });
    });

    it('no administra códigos de equipos de colegios (N0)', async () => {
      prismaMock.team.findFirst.mockResolvedValue({
        ...universityTeam,
        teamCode: 'N0-ABC-001',
        verificationCode: null,
      });

      await expect(service.regenerate(10, adminId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('student panel', () => {
    it('devuelve el código del equipo del estudiante', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);

      await expect(service.getCodeForStudent('student-1')).resolves.toEqual({
        teamId: 10,
        teamCode: 'N10-ABC-1001',
        verificationCode: 'K7M2QX',
      });
    });
  });
});

describe('verification-code.util', () => {
  it('genera códigos de 6 caracteres sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(randomVerificationCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('N0 identifica a los equipos de colegios y N10 no', () => {
    expect(isCollegeTeamCode('N0-ABC-001')).toBe(true);
    expect(isCollegeTeamCode('N10-ABC-1001')).toBe(false);
    expect(isCollegeTeamCode('N2-ABC-201')).toBe(false);
  });
});
