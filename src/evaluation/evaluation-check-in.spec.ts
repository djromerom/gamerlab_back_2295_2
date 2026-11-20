import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  evaluationBlockerException,
  JUROR_NOT_CHECKED_IN,
  NOT_CHECKED_IN_MESSAGE,
} from './evaluation-blockers';
import { EvaluationService } from './evaluation.service';

/**
 * BG-71 (ARK-285): solo califica quien registró su llegada en la mesa (check-in de HU-11).
 * Prisma simulado; la e2e con BD real está en test/evaluation-check-in.e2e-spec.ts.
 */
const PROFESSOR_ROLE_ID = 3;
const JUROR_ROLE_ID = 2;
const EDITION_ID = 1;
const JUROR = 'juror-1';

/** Videojuego tal como lo devuelve la consulta de `findEvaluationBlockers`. */
const gameRow = (
  id: number,
  team: Partial<{
    teamCode: string;
    assignedJurors: { id: string }[];
    members: { nrcs: { editionId: number }[] }[];
  }> = {},
) => ({
  id,
  isActive: true,
  videogameStatus: { status: 'CONFIRMADO' },
  team: {
    id: id * 10,
    teamCode: 'N1-01',
    editionId: EDITION_ID,
    isActive: true,
    notGradable: false,
    assignedJurors: [{ id: JUROR }],
    members: [],
    ...team,
  },
});

describe('EvaluationService: check-in obligatorio para calificar (BG-71)', () => {
  const prisma = {
    eventConfiguration: { findFirst: jest.fn() },
    edition: { findFirst: jest.fn() },
    role: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    criterion: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
    jurorAttendance: { findFirst: jest.fn() },
    evaluation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    evaluationIdempotency: { findUnique: jest.fn(), create: jest.fn() },
    evaluationDraft: { updateMany: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const criterionService = { findForSelect: jest.fn() };
  const verification = {
    assertVerified: jest.fn(),
    findUnverifiedVideogameIds: jest.fn(),
  };
  let service: EvaluationService;
  let games: Map<number, ReturnType<typeof gameRow>>;

  const actor = (roleId = JUROR_ROLE_ID) => ({
    id: JUROR,
    roleId,
    jurorCategory: null,
  });
  const detail = { criterionId: 1, score: 4 };
  const payload = (videogameId: number) =>
    ({ comments: 'ok', videogameId, details: [detail] }) as never;

  beforeEach(() => {
    jest.resetAllMocks();
    games = new Map([[7, gameRow(7)]]);
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      evaluationsOpen: true,
    });
    prisma.edition.findFirst.mockResolvedValue({ id: EDITION_ID });
    prisma.role.findUnique.mockResolvedValue({ id: PROFESSOR_ROLE_ID });
    prisma.user.findUnique.mockResolvedValue({
      roleId: JUROR_ROLE_ID,
      jurorCategory: 'JUNIOR',
    });
    prisma.criterion.findMany.mockResolvedValue([{ id: 1, weight: 1 }]);
    criterionService.findForSelect.mockResolvedValue([{ id: 1, weight: 1 }]);
    prisma.videogame.findMany.mockImplementation(
      ({ where }: { where: { id: { in: number[] } } }) =>
        Promise.resolve(where.id.in.map((id) => games.get(id) ?? gameRow(id))),
    );
    prisma.jurorAttendance.findFirst.mockResolvedValue(null); // sin check-in
    prisma.evaluation.create.mockResolvedValue({ id: 99 });
    prisma.evaluation.findUnique.mockResolvedValue(null);
    prisma.evaluation.findMany.mockResolvedValue([]);
    prisma.evaluationIdempotency.findUnique.mockResolvedValue(null);
    prisma.evaluationDraft.updateMany.mockResolvedValue({ count: 0 });
    verification.findUnverifiedVideogameIds.mockResolvedValue(new Set());
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );
    service = new EvaluationService(
      prisma as never,
      criterionService as never,
      verification as never,
    );
  });

  describe('findEvaluationBlockers', () => {
    it('un jurado asignado sin check-in queda bloqueado con el mensaje de llegada', async () => {
      const blockers = await service.findEvaluationBlockers(
        actor(),
        [7],
        EDITION_ID,
        PROFESSOR_ROLE_ID,
      );
      expect(blockers.get(7)).toBe(NOT_CHECKED_IN_MESSAGE);
    });

    it('busca solo la asistencia ACTIVA del jurado en la edición activa (una anulada no cuenta)', async () => {
      await service.findEvaluationBlockers(actor(), [7], 5, PROFESSOR_ROLE_ID);
      expect(prisma.jurorAttendance.findFirst).toHaveBeenCalledWith({
        where: { jurorId: JUROR, editionId: 5, isActive: true },
        select: { id: true },
      });
    });

    it('con check-in no hay bloqueo', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({ id: 1 });
      const blockers = await service.findEvaluationBlockers(
        actor(),
        [7],
        EDITION_ID,
        PROFESSOR_ROLE_ID,
      );
      expect(blockers.size).toBe(0);
    });

    it('una sola consulta de asistencia para toda la lista de juegos', async () => {
      games = new Map([
        [1, gameRow(1)],
        [2, gameRow(2)],
        [3, gameRow(3)],
      ]);
      const blockers = await service.findEvaluationBlockers(
        actor(),
        [1, 2, 3],
        EDITION_ID,
        PROFESSOR_ROLE_ID,
      );
      expect(prisma.jurorAttendance.findFirst).toHaveBeenCalledTimes(1);
      expect([...blockers.values()]).toEqual([
        NOT_CHECKED_IN_MESSAGE,
        NOT_CHECKED_IN_MESSAGE,
        NOT_CHECKED_IN_MESSAGE,
      ]);
    });

    it('un grupo que no es suyo se sigue rechazando por asignación y no consulta la asistencia', async () => {
      games = new Map([[7, gameRow(7, { assignedJurors: [] })]]);
      const blockers = await service.findEvaluationBlockers(
        actor(),
        [7],
        EDITION_ID,
        PROFESSOR_ROLE_ID,
      );
      expect(blockers.get(7)).toBe('Este grupo no está asignado al evaluador');
      expect(prisma.jurorAttendance.findFirst).not.toHaveBeenCalled();
    });

    it('los otros bloqueos ganan sobre el de check-in (colegios para un junior)', async () => {
      games = new Map([[7, gameRow(7, { teamCode: 'N0-COLEGIOS-01' })]]);
      const blockers = await service.findEvaluationBlockers(
        actor(),
        [7],
        EDITION_ID,
        PROFESSOR_ROLE_ID,
      );
      expect(blockers.get(7)).toBe(
        'Los equipos de colegios solo los califica un evaluador senior',
      );
    });

    describe('profesores', () => {
      const ownNrc = [{ nrcs: [{ editionId: EDITION_ID }] }];

      it('un profesor ASIGNADO al grupo como jurado necesita check-in', async () => {
        games = new Map([[7, gameRow(7, { members: ownNrc })]]);
        const blockers = await service.findEvaluationBlockers(
          actor(PROFESSOR_ROLE_ID),
          [7],
          EDITION_ID,
          PROFESSOR_ROLE_ID,
        );
        expect(blockers.get(7)).toBe(NOT_CHECKED_IN_MESSAGE);
      });

      it('un profesor que califica solo por ser dueño del NRC (sin estar asignado) NO lo necesita', async () => {
        games = new Map([
          [7, gameRow(7, { assignedJurors: [], members: ownNrc })],
        ]);
        const blockers = await service.findEvaluationBlockers(
          actor(PROFESSOR_ROLE_ID),
          [7],
          EDITION_ID,
          PROFESSOR_ROLE_ID,
        );
        expect(blockers.size).toBe(0);
        expect(prisma.jurorAttendance.findFirst).not.toHaveBeenCalled();
      });
    });

    it('con requireCheckIn: false no consulta ni bloquea (lista de borradores)', async () => {
      const blockers = await service.findEvaluationBlockers(
        actor(),
        [7],
        EDITION_ID,
        PROFESSOR_ROLE_ID,
        { requireCheckIn: false },
      );
      expect(blockers.size).toBe(0);
      expect(prisma.jurorAttendance.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('envío individual', () => {
    it('sin check-in responde 409 JUROR_NOT_CHECKED_IN, no guarda nada y no pide el código del grupo', async () => {
      const error = await service
        .createEvaluationWithDetails(JUROR, payload(7))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        code: JUROR_NOT_CHECKED_IN,
        message: NOT_CHECKED_IN_MESSAGE,
      });
      expect(prisma.evaluation.create).not.toHaveBeenCalled();
      expect(verification.assertVerified).not.toHaveBeenCalled();
    });

    it('con check-in guarda la evaluación', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({ id: 1 });
      const result = await service.createEvaluationWithDetails(
        JUROR,
        payload(7),
      );
      expect(result.evaluationId).toBe(99);
      expect(prisma.evaluation.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('envío en lote', () => {
    const batch = (...ids: number[]) =>
      ({ evaluations: ids.map((id) => payload(id)) }) as never;

    it('sin check-in responde 409 de toda la petición y no escribe ninguna fila', async () => {
      games = new Map([
        [7, gameRow(7)],
        [8, gameRow(8)],
      ]);

      const error = await service
        .createBatchEvaluations(JUROR, batch(7, 8))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        code: JUROR_NOT_CHECKED_IN,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.evaluation.create).not.toHaveBeenCalled();
    });

    it('con check-in guarda las filas', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({ id: 1 });
      const { results } = await service.createBatchEvaluations(JUROR, batch(7));
      expect(results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
      ]);
      expect(results.failed).toEqual([]);
    });

    it('un problema de una fila (grupo no asignado) sigue siendo un fallo de esa fila, no un 409', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({ id: 1 });
      games = new Map([
        [7, gameRow(7)],
        [8, gameRow(8, { assignedJurors: [] })],
      ]);
      const { results } = await service.createBatchEvaluations(
        JUROR,
        batch(7, 8),
      );
      expect(results.successful.map((r) => r.videogameId)).toEqual([7]);
      expect(results.failed).toEqual([
        { videogameId: 8, error: 'Este grupo no está asignado al evaluador' },
      ]);
    });
  });

  describe('evaluationBlockerException', () => {
    it('el bloqueo de check-in es un 409 con code', () => {
      const error = evaluationBlockerException(NOT_CHECKED_IN_MESSAGE);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
    });

    it('los demás bloqueos siguen siendo 403 con el motivo', () => {
      const error = evaluationBlockerException(
        'Este grupo no está asignado al evaluador',
      );
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toBe('Este grupo no está asignado al evaluador');
    });
  });
});
