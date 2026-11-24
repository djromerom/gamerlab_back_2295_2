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
    team: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    videogame: { findMany: jest.fn() },
    teamVerification: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    teamVerificationLog: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const universityTeam = {
    id: 10,
    editionId: 1,
    teamCode: 'N10-ABC-1001',
    verificationCode: 'K7M2QX',
    notGradable: false,
    assignedJurors: [{ id: jurorId }],
    edition: { status: 'ACTIVE', title: 'Edición 1' },
  };

  const failedAt = (n: number, at = new Date()) =>
    Array.from({ length: n }, () => ({ createdAt: at }));

  beforeEach(() => {
    jest.resetAllMocks();
    // Forma interactiva (verify) y forma de arreglo (regenerate).
    prismaMock.$transaction.mockImplementation(
      (arg: ((tx: typeof prismaMock) => Promise<unknown>) | unknown[]) =>
        typeof arg === 'function' ? arg(prismaMock) : Promise.resolve([]),
    );
    service = new TeamVerificationService(prismaMock as any);
  });

  describe('verify', () => {
    const dto = { teamId: 10, code: 'K7M2QX' };

    it('guarda la verificación cuando el código coincide', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue([]);

      const result = await service.verify(jurorId, dto);

      expect(result).toEqual({ verified: true, required: true });
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.teamVerification.create).toHaveBeenCalledWith({
        data: { teamId: 10, jurorId },
      });
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
      prismaMock.teamVerificationLog.findMany.mockResolvedValue(failedAt(1));

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
      expect(prismaMock.teamVerification.create).not.toHaveBeenCalled();
    });

    it('bloquea con 429 tras el máximo de intentos fallidos sin comparar el código', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue(
        failedAt(MAX_FAILED_ATTEMPTS),
      );

      const error: unknown = await service
        .verify(jurorId, dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(prismaMock.teamVerificationLog.create).not.toHaveBeenCalled();
      expect(prismaMock.teamVerification.create).not.toHaveBeenCalled();
    });

    it('toma el candado por (equipo, jurado) antes de contar los intentos', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue([]);

      await service.verify(jurorId, dto);

      const [sql, ...values] = prismaMock.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(sql.join('?')).toContain('pg_advisory_xact_lock');
      expect(values).toEqual([10, jurorId]);
      expect(prismaMock.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.teamVerificationLog.findMany.mock.invocationCallOrder[0],
      );
    });

    it('con peticiones simultáneas no acepta más de MAX_FAILED_ATTEMPTS intentos fallidos', async () => {
      // Simula el candado de PostgreSQL: cada transacción espera a que termine la anterior.
      let queue: Promise<unknown> = Promise.resolve();
      prismaMock.$transaction.mockImplementation(
        (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
          const run = queue.then(() => fn(prismaMock));
          queue = run.catch(() => undefined);
          return run;
        },
      );
      let failedLogs = 0;
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      prismaMock.teamVerificationLog.findMany.mockImplementation(() =>
        Promise.resolve(failedAt(failedLogs)),
      );
      prismaMock.teamVerificationLog.create.mockImplementation(() => {
        failedLogs++;
        return Promise.resolve({});
      });

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          service.verify(jurorId, { teamId: 10, code: 'ZZZZZZ' }),
        ),
      );
      const errors = results.map((r) =>
        r.status === 'rejected' ? (r.reason as HttpException) : null,
      );

      expect(failedLogs).toBe(MAX_FAILED_ATTEMPTS);
      expect(
        errors.filter((e) => e instanceof BadRequestException),
      ).toHaveLength(MAX_FAILED_ATTEMPTS - 1);
      expect(errors.filter((e) => e?.getStatus() === 429)).toHaveLength(4);
    });

    it('no vuelve a pedir el código si el jurado ya verificó el grupo', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.verify(jurorId, {
        teamId: 10,
        code: 'ZZZZZZ',
      });

      expect(result).toEqual({ verified: true, required: true });
      expect(prismaMock.teamVerificationLog.findMany).not.toHaveBeenCalled();
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

    it('del 1.º al 4.º fallo responde 400 con los intentos restantes y el 5.º responde 429', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      let failed = 0;
      prismaMock.teamVerificationLog.findMany.mockImplementation(() =>
        Promise.resolve(failedAt(failed)),
      );
      prismaMock.teamVerificationLog.create.mockImplementation(() => {
        failed++;
        return Promise.resolve({});
      });

      for (let n = 1; n < MAX_FAILED_ATTEMPTS; n++) {
        const error: unknown = await service
          .verify(jurorId, { teamId: 10, code: 'ZZZZZZ' })
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as HttpException).message).toContain(
          `Intentos restantes: ${MAX_FAILED_ATTEMPTS - n}`,
        );
      }

      const fifth: unknown = await service
        .verify(jurorId, { teamId: 10, code: 'ZZZZZZ' })
        .catch((e: unknown) => e);
      expect((fifth as HttpException).getStatus()).toBe(429);
      expect((fifth as HttpException).message).toContain(
        'Demasiados intentos fallidos. Espera 10 minutos',
      );
      expect(failed).toBe(MAX_FAILED_ATTEMPTS);
    });

    it('5 fallos repartidos en más de 10 minutos no bloquean (la ventana filtra por fecha)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-30T12:00:00.000Z'));
      try {
        const min = (m: number) => new Date(Date.now() - m * 60 * 1000);
        // 3 fallos viejos (fuera de ventana) y 2 recientes.
        const all = [1, 2, 3, 11, 12].map((m) => ({
          teamId: 10,
          createdAt: min(m),
        }));
        prismaMock.team.findFirst.mockResolvedValue(universityTeam);
        prismaMock.teamVerification.findUnique.mockResolvedValue(null);
        prismaMock.teamVerificationLog.findMany.mockImplementation(
          ({ where }: { where: { createdAt: { gte: Date } } }) =>
            Promise.resolve(
              all.filter((f) => f.createdAt >= where.createdAt.gte),
            ),
        );

        await expect(service.verify(jurorId, dto)).resolves.toEqual({
          verified: true,
          required: true,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('verifica correctamente cuando el bloqueo ya expiró', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);
      prismaMock.teamVerification.findUnique.mockResolvedValue(null);
      // La consulta ya filtra por ventana: fallos viejos no vuelven.
      prismaMock.teamVerificationLog.findMany.mockResolvedValue([]);

      await expect(service.verify(jurorId, dto)).resolves.toEqual({
        verified: true,
        required: true,
      });
      const where = (
        prismaMock.teamVerificationLog.findMany.mock.calls[0] as [
          { where: { createdAt: { gte: Date } } },
        ]
      )[0].where;
      expect(where.createdAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('getLocks', () => {
    const now = new Date('2026-10-30T12:00:00.000Z');
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
    });
    afterEach(() => jest.useRealTimers());

    it('con 5 fallos recientes marca locked y lockedUntil = ahora + 10 min', async () => {
      prismaMock.teamVerification.findMany.mockResolvedValue([]);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue(
        failedAt(5, now).map((f) => ({ ...f, teamId: 10 })),
      );

      const locks = await service.getLocks(jurorId, [10]);

      expect(locks).toEqual({
        10: { locked: true, lockedUntil: '2026-10-30T12:10:00.000Z' },
      });
    });

    it('pasada la ventana el bloqueo caduca (la consulta excluye fallos viejos)', async () => {
      prismaMock.teamVerification.findMany.mockResolvedValue([]);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue([]);

      const locks = await service.getLocks(jurorId, [10]);

      expect(locks).toEqual({ 10: { locked: false, lockedUntil: null } });
      const { where } = (
        prismaMock.teamVerificationLog.findMany.mock.calls[0] as [
          { where: { createdAt: { gte: Date } } },
        ]
      )[0];
      expect(where.createdAt.gte.toISOString()).toBe(
        '2026-10-30T11:50:00.000Z',
      );
    });

    it('lockedUntil usa el 5.º fallo más reciente (se libera al salir de la ventana el más antiguo)', async () => {
      prismaMock.teamVerification.findMany.mockResolvedValue([]);
      const old = new Date(now.getTime() - 9 * 60 * 1000);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue([
        { teamId: 10, createdAt: now },
        { teamId: 10, createdAt: now },
        { teamId: 10, createdAt: now },
        { teamId: 10, createdAt: now },
        { teamId: 10, createdAt: old },
      ]);

      const locks = await service.getLocks(jurorId, [10]);

      expect(locks[10].lockedUntil).toBe('2026-10-30T12:01:00.000Z');
    });

    it('no mezcla grupos: bloqueado en uno no implica bloqueado en otro', async () => {
      prismaMock.teamVerification.findMany.mockResolvedValue([]);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue([
        ...failedAt(5, now).map((f) => ({ ...f, teamId: 10 })),
        ...failedAt(2, now).map((f) => ({ ...f, teamId: 11 })),
      ]);

      const locks = await service.getLocks(jurorId, [10, 11, 12]);

      expect(locks[10].locked).toBe(true);
      expect(locks[11]).toEqual({ locked: false, lockedUntil: null });
      expect(locks[12]).toEqual({ locked: false, lockedUntil: null });
    });

    it('un grupo ya verificado no figura bloqueado', async () => {
      prismaMock.teamVerification.findMany.mockResolvedValue([{ teamId: 10 }]);
      prismaMock.teamVerificationLog.findMany.mockResolvedValue(
        failedAt(5, now).map((f) => ({ ...f, teamId: 10 })),
      );

      const locks = await service.getLocks(jurorId, [10]);

      expect(locks[10]).toEqual({ locked: false, lockedUntil: null });
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

  describe('getStatus', () => {
    it('marca true los verificados y los N0, y false los pendientes o inexistentes', async () => {
      prismaMock.team.findMany.mockResolvedValue([
        { ...universityTeam, id: 1, verifications: [{ id: 9 }] },
        { ...universityTeam, id: 2, verifications: [] },
        {
          ...universityTeam,
          id: 3,
          teamCode: 'N0-ABC-001',
          verificationCode: null,
          verifications: [],
        },
      ]);

      const result = await service.getStatus(jurorId, [1, 2, 3, 4]);

      expect(result).toEqual({ 1: true, 2: false, 3: true, 4: false });
      expect(prismaMock.team.findMany).toHaveBeenCalledTimes(1);
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
    it('ARK-130: no regenera el código de un equipo de una edición anterior', async () => {
      prismaMock.team.findFirst.mockResolvedValueOnce({
        ...universityTeam,
        edition: { status: 'INACTIVE', title: 'Feria 4' },
      });
      await expect(service.regenerate(10, adminId)).rejects.toThrow(/solo lectura/);
      expect(prismaMock.teamVerificationLog.create).not.toHaveBeenCalled();
    });

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
        notGradable: false,
      });
    });

    it('busca el equipo que lidera o en el que es integrante activo (por correo)', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);

      await expect(
        service.getCodeForStudent('student-2', 'Integrante@Uninorte.edu.co'),
      ).resolves.toMatchObject({ verificationCode: 'K7M2QX' });
      expect(prismaMock.team.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: [
              { userId: 'student-2' },
              {
                members: {
                  some: {
                    isActive: true,
                    email: { equals: 'integrante@uninorte.edu.co', mode: 'insensitive' },
                  },
                },
              },
            ],
          }),
        }),
      );
    });

    it('sin correo solo busca el equipo que lidera', async () => {
      prismaMock.team.findFirst.mockResolvedValue(universityTeam);

      await service.getCodeForStudent('student-1');
      expect(prismaMock.team.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'student-1', isActive: true }),
        }),
      );
    });

    it('404 si no lidera ni integra un equipo de la edición activa', async () => {
      prismaMock.team.findFirst.mockResolvedValue(null);

      await expect(
        service.getCodeForStudent('x', 'otro@uninorte.edu.co'),
      ).rejects.toBeInstanceOf(NotFoundException);
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
