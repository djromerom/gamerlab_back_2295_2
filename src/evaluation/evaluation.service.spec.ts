import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BatchEvaluationDto } from './dto/batchEvaluation.dto';
import { EvaluationService } from './evaluation.service';
import { UNVERIFIED_TEAM_MESSAGE } from '../team-verification/team-verification.service';

const NOT_FOUND_MESSAGE = 'El videojuego no existe o está inactivo';
const ARCHIVED_MESSAGE = 'El videojuego no pertenece a la edición activa';
const COLLEGE_MESSAGE =
  'Los equipos de colegios solo los califica un evaluador senior';
const NOT_ASSIGNED_MESSAGE = 'Este grupo no está asignado al evaluador';

const PROFESSOR_ROLE_ID = 3;
const JUROR_ROLE_ID = 2;

/** Videojuego tal como lo devuelve la consulta de `findEvaluationBlockers`. */
const gameRow = (
  id: number,
  team: Partial<{
    teamCode: string;
    editionId: number;
    isActive: boolean;
    assignedJurors: { id: string }[];
    members: { nrcs: { editionId: number }[] }[];
  }> = {},
  videogameIsActive = true,
) => ({
  id,
  isActive: videogameIsActive,
  videogameStatus: { status: 'CONFIRMADO' },
  team: {
    id: id * 10,
    teamCode: 'N1-01',
    editionId: 1,
    isActive: true,
    assignedJurors: [{ id: 'juror-1' }],
    members: [],
    ...team,
  },
});

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(
    `Invalid \`prisma.evaluation.create()\` invocation: ${code}`,
    { code, clientVersion: 'test' },
  );

describe('EvaluationService - verificación del grupo (HU-19)', () => {
  let service: EvaluationService;

  const prismaMock = {
    eventConfiguration: { findFirst: jest.fn() },
    edition: { findFirst: jest.fn() },
    role: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    criterion: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
    evaluation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    evaluationIdempotency: { findUnique: jest.fn(), create: jest.fn() },
    evaluationDraft: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const criterionServiceMock = { findForSelect: jest.fn() };
  const verificationMock = {
    assertVerified: jest.fn(),
    findUnverifiedVideogameIds: jest.fn(),
  };

  const detail = {
    criterionId: 1,
    score: 4,
    createdAt: '2026-11-26T10:00:00.000Z',
    updatedAt: '2026-11-26T10:00:00.000Z',
  };
  const evaluation = (videogameId: number) => ({
    date: '2026-11-26T10:00:00.000Z',
    comments: 'ok',
    videogameId,
    details: [detail],
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.eventConfiguration.findFirst.mockResolvedValue({
      evaluationsOpen: true,
    });
    prismaMock.edition.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.role.findUnique.mockResolvedValue({ id: PROFESSOR_ROLE_ID });
    prismaMock.user.findUnique.mockResolvedValue({
      roleId: JUROR_ROLE_ID,
      jurorCategory: 'JUNIOR',
    });
    prismaMock.criterion.findMany.mockResolvedValue([{ id: 1, weight: 1 }]);
    criterionServiceMock.findForSelect.mockResolvedValue([
      { id: 1, weight: 1 },
    ]);
    prismaMock.videogame.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id.in.map((id: number) => gameRow(id))),
    );
    prismaMock.evaluation.create.mockResolvedValue({ id: 99 });
    prismaMock.evaluation.findUnique.mockResolvedValue(null);
    prismaMock.evaluation.findMany.mockResolvedValue([]);
    prismaMock.evaluationIdempotency.findUnique.mockResolvedValue(null);
    verificationMock.findUnverifiedVideogameIds.mockResolvedValue(new Set());
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));

    service = new EvaluationService(
      prismaMock as any,
      criterionServiceMock as any,
      verificationMock as any,
    );
  });

  it('individual: no guarda si el jurado no verificó el grupo', async () => {
    verificationMock.assertVerified.mockRejectedValue(
      new ForbiddenException(UNVERIFIED_TEAM_MESSAGE),
    );

    await expect(
      service.createEvaluationWithDetails('juror-1', evaluation(7) as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('individual: guarda cuando el grupo está verificado', async () => {
    verificationMock.assertVerified.mockResolvedValue(undefined);

    const result = await service.createEvaluationWithDetails(
      'juror-1',
      evaluation(7) as any,
    );

    expect(result.evaluationId).toBe(99);
    expect(verificationMock.assertVerified).toHaveBeenCalledWith('juror-1', 7);
  });

  it('individual: una repetición con la misma Idempotency-Key responde antes de verificar', async () => {
    const payload = evaluation(7);
    const stored = { evaluationId: 41, message: 'guardada' };
    prismaMock.evaluationIdempotency.findUnique.mockResolvedValue({
      contentHash: (service as any).contentHash(payload),
      response: stored,
    });

    const result = await service.createEvaluationWithDetails(
      'juror-1',
      payload as any,
      'key-1',
    );

    expect(result).toEqual(stored);
    expect(verificationMock.assertVerified).not.toHaveBeenCalled();
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  it('lote: reporta por fila los grupos sin verificar y guarda el resto', async () => {
    verificationMock.findUnverifiedVideogameIds.mockResolvedValue(new Set([8]));

    const { results } = await service.createBatchEvaluations('juror-1', {
      evaluations: [evaluation(7), evaluation(8)] as any,
    });

    expect(results.successful).toEqual([{ videogameId: 7, evaluationId: 99 }]);
    expect(results.failed).toEqual([
      { videogameId: 8, error: UNVERIFIED_TEAM_MESSAGE },
    ]);
    expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
    expect(verificationMock.findUnverifiedVideogameIds).toHaveBeenCalledWith(
      'juror-1',
      [7, 8],
    );
  });

  it('lote: una repetición con la misma Idempotency-Key devuelve la respuesta guardada sin filtrar filas', async () => {
    const payload = { evaluations: [evaluation(7), evaluation(8)] } as any;
    const stored = {
      results: {
        successful: [
          { videogameId: 7, evaluationId: 1 },
          { videogameId: 8, evaluationId: 2 },
        ],
        failed: [],
      },
      message: 'Procesadas 2 evaluaciones: 2 exitosas, 0 fallidas',
    };
    // Entre el primer envío y el reintento cambió la verificación del grupo 8
    verificationMock.findUnverifiedVideogameIds.mockResolvedValue(new Set([8]));
    prismaMock.evaluationIdempotency.findUnique.mockResolvedValue({
      contentHash: (service as any).contentHash(payload),
      response: stored,
    });

    const result = await service.createBatchEvaluations(
      'juror-1',
      payload,
      'key-1',
    );

    expect(result).toEqual(stored);
    expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // U1: quién puede calificar un grupo
  // ---------------------------------------------------------------------------
  describe('findEvaluationBlockers', () => {
    const juniorJuror = {
      id: 'juror-1',
      roleId: JUROR_ROLE_ID,
      jurorCategory: 'JUNIOR' as any,
    };
    const seniorJuror = { ...juniorJuror, jurorCategory: 'SENIOR' as any };
    const professor = {
      id: 'prof-1',
      roleId: PROFESSOR_ROLE_ID,
      jurorCategory: null,
    };
    const blockers = (actor: any, rows: any[], ids: number[]) => {
      prismaMock.videogame.findMany.mockResolvedValue(rows);
      return (service as any).findEvaluationBlockers(actor, ids, 1) as Promise<
        Map<number, string>
      >;
    };

    it('usa una sola consulta para todos los videojuegos', async () => {
      await blockers(juniorJuror, [gameRow(7), gameRow(8)], [7, 8]);

      expect(prismaMock.videogame.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.videogame.findMany.mock.calls[0][0].where).toEqual({
        id: { in: [7, 8] },
      });
    });

    it('rechaza juego inexistente', async () => {
      const result = await blockers(juniorJuror, [], [5]);
      expect(result.get(5)).toBe(NOT_FOUND_MESSAGE);
    });

    it('rechaza juego de un equipo inactivo', async () => {
      const result = await blockers(
        juniorJuror,
        [gameRow(7, { isActive: false })],
        [7],
      );
      expect(result.get(7)).toBe(NOT_FOUND_MESSAGE);
    });

    it('rechaza un videojuego inactivo de un equipo activo y asignado', async () => {
      const result = await blockers(juniorJuror, [gameRow(7, {}, false)], [7]);
      expect(result.get(7)).toBe(NOT_FOUND_MESSAGE);
    });

    it('la consulta pide isActive del videojuego y solo NRC activos del profesor', async () => {
      await blockers(professor, [gameRow(7)], [7]);

      const { select } = prismaMock.videogame.findMany.mock.calls[0][0];
      expect(select.isActive).toBe(true);
      expect(select.team.select.members.select.nrcs.where).toEqual({
        professorId: 'prof-1',
        isActive: true,
      });
    });

    it('rechaza juego de edición archivada', async () => {
      const result = await blockers(
        juniorJuror,
        [gameRow(7, { editionId: 0 })],
        [7],
      );
      expect(result.get(7)).toBe(ARCHIVED_MESSAGE);
    });

    it('rechaza equipo de colegios a un jurado junior', async () => {
      const result = await blockers(
        juniorJuror,
        [gameRow(7, { teamCode: 'N0-01' })],
        [7],
      );
      expect(result.get(7)).toBe(COLLEGE_MESSAGE);
    });

    it('permite equipo de colegios a un jurado senior asignado', async () => {
      const result = await blockers(
        seniorJuror,
        [gameRow(7, { teamCode: 'N0-01' })],
        [7],
      );
      expect(result.has(7)).toBe(false);
    });

    it('rechaza equipo de colegios a un jurado senior no asignado', async () => {
      const result = await blockers(
        seniorJuror,
        [gameRow(7, { teamCode: 'N0-01', assignedJurors: [] })],
        [7],
      );
      expect(result.get(7)).toBe(NOT_ASSIGNED_MESSAGE);
    });

    it('rechaza grupo no asignado', async () => {
      const result = await blockers(
        juniorJuror,
        [gameRow(7, { assignedJurors: [] })],
        [7],
      );
      expect(result.get(7)).toBe(NOT_ASSIGNED_MESSAGE);
    });

    it.each(['PENDIENTE', 'RECHAZADO'])('BG-35: un juego %s no se califica', async (status) => {
      const result = await blockers(
        juniorJuror,
        [{ ...gameRow(7), videogameStatus: { status } }],
        [7],
      );
      expect(result.get(7)).toBe('La inscripción de este grupo no está confirmada');
    });

    it('permite jurado asignado', async () => {
      const result = await blockers(juniorJuror, [gameRow(7)], [7]);
      expect(result.size).toBe(0);
    });

    it('permite profesor con NRC propio', async () => {
      const result = await blockers(
        professor,
        [
          gameRow(7, {
            teamCode: 'N0-01',
            assignedJurors: [],
            members: [{ nrcs: [] }, { nrcs: [{ editionId: 1 }] }],
          }),
        ],
        [7],
      );
      expect(result.size).toBe(0);
    });

    it('rechaza profesor cuyo NRC es de otra edición', async () => {
      const result = await blockers(
        professor,
        [
          gameRow(7, {
            assignedJurors: [],
            members: [{ nrcs: [{ editionId: 0 }] }],
          }),
        ],
        [7],
      );
      expect(result.get(7)).toBe(NOT_ASSIGNED_MESSAGE);
    });

    it('un jurado no pasa por tener un NRC (solo cuenta para profesores)', async () => {
      const result = await blockers(
        juniorJuror,
        [
          gameRow(7, {
            assignedJurors: [],
            members: [{ nrcs: [{ editionId: 1 }] }],
          }),
        ],
        [7],
      );
      expect(result.get(7)).toBe(NOT_ASSIGNED_MESSAGE);
    });
  });

  describe('createEvaluationWithDetails (U1, #4, #13, M8)', () => {
    beforeEach(() => {
      verificationMock.assertVerified.mockResolvedValue(undefined);
    });

    const expectForbidden = async (message: string) => {
      const promise = service.createEvaluationWithDetails(
        'juror-1',
        evaluation(7) as any,
      );
      await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
      await expect(promise).rejects.toThrow(message);
      expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
    };

    it('rechaza juego de edición archivada (403)', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        gameRow(7, { editionId: 0 }),
      ]);
      await expectForbidden(ARCHIVED_MESSAGE);
      expect(verificationMock.assertVerified).not.toHaveBeenCalled();
    });

    it('rechaza equipo de colegios a un jurado junior (403)', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        gameRow(7, { teamCode: 'N0-01' }),
      ]);
      await expectForbidden(COLLEGE_MESSAGE);
    });

    it('rechaza grupo no asignado (403)', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        gameRow(7, { assignedJurors: [] }),
      ]);
      await expectForbidden(NOT_ASSIGNED_MESSAGE);
    });

    it('rechaza juego inexistente con un mensaje propio (403)', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([]);
      await expectForbidden(NOT_FOUND_MESSAGE);
    });

    it('rechaza un videojuego inactivo (403)', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([gameRow(7, {}, false)]);
      await expectForbidden(NOT_FOUND_MESSAGE);
    });

    it('permite profesor con NRC propio', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        roleId: PROFESSOR_ROLE_ID,
        jurorCategory: null,
      });
      prismaMock.videogame.findMany.mockResolvedValue([
        gameRow(7, {
          assignedJurors: [],
          members: [{ nrcs: [{ editionId: 1 }] }],
        }),
      ]);

      const result = await service.createEvaluationWithDetails(
        'juror-1',
        evaluation(7) as any,
      );
      expect(result.evaluationId).toBe(99);
      expect(prismaMock.evaluation.create.mock.calls[0][0].data.isSenior).toBe(
        true,
      );
    });

    it('permite jurado asignado y guarda la edición del juego', async () => {
      const result = await service.createEvaluationWithDetails(
        'juror-1',
        evaluation(7) as any,
      );
      expect(result.evaluationId).toBe(99);
      expect(prismaMock.evaluation.create.mock.calls[0][0].data.editionId).toBe(
        1,
      );
    });

    it('HU-18: al enviar cierra el borrador del juego dentro de la misma transacción', async () => {
      await service.createEvaluationWithDetails('juror-1', evaluation(7) as any);

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.evaluationDraft.updateMany).toHaveBeenCalledWith({
        where: { jurorId: 'juror-1', videogameId: { in: [7] }, isActive: true },
        data: { isActive: false, version: { increment: 1 } },
      });
    });

    it('rechaza details con el mismo criterio repetido (400)', async () => {
      criterionServiceMock.findForSelect.mockResolvedValue([
        { id: 1, weight: 0.5 },
        { id: 2, weight: 0.5 },
      ]);
      const payload = {
        ...evaluation(7),
        details: [detail, detail, { ...detail, criterionId: 2 }],
      };

      await expect(
        service.createEvaluationWithDetails('juror-1', payload as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
    });

    it('rechaza details que no incluyen todos los criterios activos (400, con los ids faltantes)', async () => {
      criterionServiceMock.findForSelect.mockResolvedValue([
        { id: 1, weight: 0.4 },
        { id: 2, weight: 0.3 },
        { id: 3, weight: 0.3 },
      ]);

      const promise = service.createEvaluationWithDetails(
        'juror-1',
        evaluation(7) as any,
      );
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(/2, 3/);
      expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
    });

    it('totalScore nunca supera 5', async () => {
      criterionServiceMock.findForSelect.mockResolvedValue([
        { id: 1, weight: 2 },
      ]);
      await service.createEvaluationWithDetails('juror-1', {
        ...evaluation(7),
        details: [{ ...detail, score: 5 }],
      } as any);

      expect(
        prismaMock.evaluation.create.mock.calls[0][0].data.totalScore,
      ).toBe(5);
    });

    it('isSenior lo calcula el servidor: un jurado junior que manda isSenior:true en el body queda isSenior:false', async () => {
      await service.createEvaluationWithDetails('juror-1', {
        ...evaluation(7),
        isSenior: true,
      } as any);

      expect(prismaMock.evaluation.create.mock.calls[0][0].data.isSenior).toBe(
        false,
      );
    });

    it('un score con 3 decimales se rechaza (400)', async () => {
      await expect(
        service.createEvaluationWithDetails('juror-1', {
          ...evaluation(7),
          details: [{ ...detail, score: 4.125 }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
    });

    it('un score con 2 decimales se acepta (incluso los que no son exactos en binario)', async () => {
      await service.createEvaluationWithDetails('juror-1', {
        ...evaluation(7),
        details: [{ ...detail, score: 4.35 }],
      } as any);
      expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
    });

    it('date, createdAt y updatedAt de los detalles los fija el servidor', async () => {
      const before = Date.now();
      await service.createEvaluationWithDetails('juror-1', {
        ...evaluation(7),
        date: '2001-01-01T00:00:00.000Z',
        details: [
          {
            ...detail,
            createdAt: '2001-01-01T00:00:00.000Z',
            updatedAt: '2001-01-01T00:00:00.000Z',
          },
        ],
      } as any);

      const data = prismaMock.evaluation.create.mock.calls[0][0].data;
      const [created] = data.details.create;
      for (const value of [data.date, created.createdAt, created.updatedAt]) {
        expect(value).toBeInstanceOf(Date);
        expect(value.getTime()).toBeGreaterThanOrEqual(before);
      }
    });
  });

  describe('createBatchEvaluations (U1, U2, #4, I10)', () => {
    it('un videojuego inactivo de un equipo activo y asignado va a failed', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        gameRow(7),
        gameRow(8, {}, false),
      ]);

      const { results } = await service.createBatchEvaluations('juror-1', {
        evaluations: [evaluation(7), evaluation(8)] as any,
      });

      expect(results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
      ]);
      expect(results.failed).toEqual([
        { videogameId: 8, error: NOT_FOUND_MESSAGE },
      ]);
      expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
    });

    it('el lote marca failed por fila con el mensaje del bloqueo y no crea esa evaluación', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        gameRow(7),
        gameRow(8, { editionId: 0 }),
      ]);

      const { results } = await service.createBatchEvaluations('juror-1', {
        evaluations: [evaluation(7), evaluation(8)] as any,
      });

      expect(results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
      ]);
      expect(results.failed).toEqual([
        { videogameId: 8, error: ARCHIVED_MESSAGE },
      ]);
      expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
      expect(
        prismaMock.evaluation.create.mock.calls[0][0].data.videogameId,
      ).toBe(7);
    });

    it('una fila con juego inexistente devuelve un mensaje propio y nunca el texto de Prisma', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([gameRow(7)]);
      prismaMock.evaluation.create.mockImplementation(({ data }: any) =>
        data.videogameId === 404
          ? Promise.reject(prismaError('P2003'))
          : Promise.resolve({ id: 99 }),
      );

      const response = await service.createBatchEvaluations('juror-1', {
        evaluations: [evaluation(7), evaluation(404)] as any,
      });

      expect(response.results.failed).toEqual([
        { videogameId: 404, error: NOT_FOUND_MESSAGE },
      ]);
      expect(JSON.stringify(response)).not.toContain('Invalid `prisma');
    });

    it('una fila con criterio repetido o incompleto va a failed y la válida se guarda', async () => {
      prismaMock.criterion.findMany.mockResolvedValue([
        { id: 1, weight: 0.5 },
        { id: 2, weight: 0.5 },
      ]);
      const valid = {
        ...evaluation(7),
        details: [detail, { ...detail, criterionId: 2 }],
      };
      const repeated = {
        ...evaluation(8),
        details: [detail, detail],
      };
      const incomplete = evaluation(9);

      const { results } = await service.createBatchEvaluations('juror-1', {
        evaluations: [valid, repeated, incomplete] as any,
      });

      expect(results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
      ]);
      expect(
        results.failed.map((f: { videogameId: number }) => f.videogameId),
      ).toEqual([8, 9]);
      expect(results.failed[1].error).toMatch(/2/);
      expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
    });

    it('un videojuego repetido en el mismo lote solo se guarda una vez', async () => {
      const { results } = await service.createBatchEvaluations('juror-1', {
        evaluations: [evaluation(7), evaluation(7)] as any,
      });

      expect(results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
      ]);
      expect(results.failed).toHaveLength(1);
      expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
    });

    it('HU-18: el lote cierra solo los borradores de las filas que se crearon', async () => {
      await service.createBatchEvaluations('juror-1', {
        evaluations: [
          evaluation(7),
          { ...evaluation(8), details: [{ ...detail, score: 3.333 }] },
        ] as any,
      });

      expect(prismaMock.evaluationDraft.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.evaluationDraft.updateMany).toHaveBeenCalledWith({
        where: { jurorId: 'juror-1', videogameId: { in: [7] }, isActive: true },
        data: { isActive: false, version: { increment: 1 } },
      });
    });

    it('un score con 3 decimales va a failed', async () => {
      const { results } = await service.createBatchEvaluations('juror-1', {
        evaluations: [
          { ...evaluation(7), details: [{ ...detail, score: 3.333 }] },
        ] as any,
      });
      expect(results.successful).toEqual([]);
      expect(results.failed).toHaveLength(1);
      expect(prismaMock.evaluation.create).not.toHaveBeenCalled();
    });

    it('date, createdAt y updatedAt los fija el servidor', async () => {
      const before = Date.now();
      await service.createBatchEvaluations('juror-1', {
        evaluations: [
          {
            ...evaluation(7),
            date: '2001-01-01T00:00:00.000Z',
            details: [
              {
                ...detail,
                createdAt: '2001-01-01T00:00:00.000Z',
                updatedAt: '2001-01-01T00:00:00.000Z',
              },
            ],
          },
        ] as any,
      });

      const data = prismaMock.evaluation.create.mock.calls[0][0].data;
      const [created] = data.details.create;
      for (const value of [data.date, created.createdAt, created.updatedAt]) {
        expect(value.getTime()).toBeGreaterThanOrEqual(before);
      }
    });

    it('un error de BD en la escritura se propaga y no devuelve "exitosa"', async () => {
      prismaMock.evaluation.create.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.createBatchEvaluations(
          'juror-1',
          { evaluations: [evaluation(7)] as any },
          'key-1',
        ),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(prismaMock.evaluationIdempotency.create).not.toHaveBeenCalled();
    });

    it('un ConflictException de una fila aparece en failed y no tumba el lote', async () => {
      prismaMock.evaluation.findMany.mockResolvedValue([
        { id: 5, videogameId: 8, contentHash: 'otro-contenido' },
      ]);

      const { results } = await service.createBatchEvaluations('juror-1', {
        evaluations: [evaluation(7), evaluation(8)] as any,
      });

      expect(results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
      ]);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].videogameId).toBe(8);
      expect(results.failed[0].error).toMatch(/evaluación distinta/i);
      expect(prismaMock.evaluation.create).toHaveBeenCalledTimes(1);
    });

    it('un reintento por P2034 no duplica filas en results', async () => {
      let attempt = 0;
      prismaMock.$transaction.mockImplementation(async (cb: any) => {
        attempt += 1;
        const response = await cb(prismaMock);
        if (attempt === 1) throw prismaError('P2034');
        return response;
      });

      const response = await service.createBatchEvaluations('juror-1', {
        evaluations: [evaluation(7), evaluation(8)] as any,
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(response.results.successful).toEqual([
        { videogameId: 7, evaluationId: 99 },
        { videogameId: 8, evaluationId: 99 },
      ]);
      expect(response.results.failed).toEqual([]);
      expect(response.message).toBe(
        'Procesadas 2 evaluaciones: 2 exitosas, 0 fallidas',
      );
    });

    it('deja de reintentar tras 3 intentos con P2034', async () => {
      prismaMock.$transaction.mockRejectedValue(prismaError('P2034'));

      await expect(
        service.createBatchEvaluations('juror-1', {
          evaluations: [evaluation(7)] as any,
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
    });

    it('no reintenta ante otros errores de BD', async () => {
      prismaMock.$transaction.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.createBatchEvaluations('juror-1', {
          evaluations: [evaluation(7)] as any,
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('el recibo de idempotencia se crea dentro de la transacción con la respuesta final', async () => {
      const response = await service.createBatchEvaluations(
        'juror-1',
        { evaluations: [evaluation(7)] as any },
        'key-1',
      );

      expect(prismaMock.evaluationIdempotency.create).toHaveBeenCalledTimes(1);
      expect(
        prismaMock.evaluationIdempotency.create.mock.calls[0][0].data.response,
      ).toEqual(response);
    });
  });
});

describe('BatchEvaluationDto (I10)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const row = (videogameId: number) => ({
    videogameId,
    date: '2026-11-26T10:00:00.000Z',
    comments: 'ok',
    details: [
      {
        criterionId: 1,
        score: 4,
        isActive: true,
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
    ],
  });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: BatchEvaluationDto });

  it('el lote vacío {evaluations:[]} responde 400', async () => {
    await expect(validate({ evaluations: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('el lote de más de 50 evaluaciones responde 400', async () => {
    const evaluations = Array.from({ length: 51 }, (_, i) => row(i + 1));
    await expect(validate({ evaluations })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('acepta 50 evaluaciones', async () => {
    const evaluations = Array.from({ length: 50 }, (_, i) => row(i + 1));
    await expect(validate({ evaluations })).resolves.toBeDefined();
  });

  it('date es opcional', async () => {
    const { date: _date, ...withoutDate } = row(1);
    await expect(
      validate({ evaluations: [withoutDate] }),
    ).resolves.toBeDefined();
  });

  it('descarta isSenior del body', async () => {
    const dto = await validate({
      evaluations: [{ ...row(1), isSenior: true }],
    });
    expect(dto.evaluations[0]).not.toHaveProperty('isSenior');
  });
});

describe('EvaluationService batch idempotency', () => {
  const payload: any = {
    evaluations: [1, 2].map((videogameId) => ({
      videogameId,
      date: '2026-10-24T12:00:00.000Z',
      comments: `game-${videogameId}`,
      details: [
        {
          criterionId: 1,
          score: 4,
          createdAt: '2026-10-24T12:00:00.000Z',
          updatedAt: '2026-10-24T12:00:00.000Z',
        },
      ],
    })),
  };

  function setup() {
    const evaluations = new Map<number, { id: number; contentHash: string }>();
    const receipts = new Map<string, any>();
    let nextId = 1;
    let transactionTail = Promise.resolve();
    const prisma: any = {
      eventConfiguration: {
        findFirst: jest.fn().mockResolvedValue({ evaluationsOpen: true }),
      },
      edition: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ roleId: 1, jurorCategory: null }),
      },
      criterion: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, weight: 1 }]),
      },
      videogame: {
        findMany: jest.fn(async ({ where }: any) =>
          where.id.in.map((id: number) => gameRow(id)),
        ),
      },
      $transaction: jest.fn((callback: any) => {
        const current = transactionTail.then(() => callback(tx));
        transactionTail = current.then(
          () => undefined,
          () => undefined,
        );
        return current;
      }),
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      evaluationDraft: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      evaluationIdempotency: {
        findUnique: jest.fn(
          async ({ where }: any) => receipts.get(where.jurorId_key.key) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          receipts.set(data.key, data);
          return data;
        }),
      },
      evaluation: {
        findMany: jest.fn(async ({ where }: any) =>
          (where.videogameId.in as number[])
            .filter((id) => evaluations.has(id))
            .map((id) => ({ videogameId: id, ...evaluations.get(id)! })),
        ),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextId++, contentHash: data.contentHash };
          evaluations.set(data.videogameId, row);
          return row;
        }),
      },
    };
    // HU-19: en estas pruebas todos los grupos están verificados
    const verification = {
      findUnverifiedVideogameIds: jest.fn().mockResolvedValue(new Set()),
    };
    const service = new EvaluationService(
      prisma,
      { findForSelect: jest.fn() } as any,
      verification as any,
    );
    return { service, prisma, tx, evaluations, receipts };
  }

  it('recovers rows left by an interrupted attempt and completes the response', async () => {
    const { service, prisma, evaluations, receipts } = setup();
    // Simulate durable rows from a process that died before writing its receipt.
    const hash = (service as any).contentHash(payload.evaluations[0]);
    evaluations.set(1, { id: 41, contentHash: hash });
    const response = await service.createBatchEvaluations(
      'juror-1',
      payload,
      'retry-key',
    );
    expect(response.results.successful).toEqual([
      { videogameId: 1, evaluationId: 41 },
      { videogameId: 2, evaluationId: 1 },
    ]);
    expect(receipts.has('retry-key')).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent requests with a key and replays the stored response', async () => {
    const { service, prisma, tx } = setup();
    const [first, second] = await Promise.all([
      service.createBatchEvaluations('juror-1', payload, 'same-key'),
      service.createBatchEvaluations('juror-1', payload, 'same-key'),
    ]);
    expect(first).toEqual(second);
    expect(tx.evaluation.create).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('rejects changed content for a completed key; an existing row with other content goes to failed', async () => {
    const { service, tx } = setup();
    await service.createBatchEvaluations('juror-1', payload, 'same-key');
    await expect(
      service.createBatchEvaluations(
        'juror-1',
        { evaluations: [payload.evaluations[0]] } as any,
        'same-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const changed = structuredClone(payload);
    changed.evaluations[0].comments = 'different';
    const response = await service.createBatchEvaluations('juror-1', changed);
    expect(response.results.failed).toHaveLength(1);
    expect(response.results.failed[0].videogameId).toBe(1);
    expect(response.results.failed[0].error).toMatch(/evaluación distinta/i);
    expect(response.results.successful).toEqual([
      { videogameId: 2, evaluationId: 2 },
    ]);
    expect(tx.evaluation.create).toHaveBeenCalledTimes(2);
  });

  it('misma Idempotency-Key repetida devuelve la respuesta guardada', async () => {
    const { service, tx } = setup();
    const first = await service.createBatchEvaluations('juror-1', payload, 'k');
    const second = await service.createBatchEvaluations(
      'juror-1',
      payload,
      'k',
    );
    expect(second).toEqual(first);
    expect(tx.evaluation.create).toHaveBeenCalledTimes(2);
  });
});

describe('EvaluationService - getEvaluationProgress', () => {
  const build = (videogames: any[]) => {
    const prisma = {
      videogame: { findMany: jest.fn().mockResolvedValue(videogames) },
    };
    const service = new EvaluationService(prisma as any, {} as any, {} as any);
    return { service, prisma };
  };
  const vg = (assigned: string[], scored: string[]) => ({
    team: { assignedJurors: assigned.map((id) => ({ id })) },
    evaluations: scored.map((jurorId) => ({ jurorId })),
  });

  it('suma asignaciones vigentes y evaluaciones de jurados asignados', async () => {
    const { service } = build([vg(['a', 'b', 'c'], ['a', 'b']), vg(['a'], ['a'])]);
    await expect(service.getEvaluationProgress(1)).resolves.toEqual({ completed: 3, assigned: 4 });
  });

  it('una evaluación de un jurado desasignado no suma al progreso', async () => {
    const { service } = build([vg(['a'], ['a', 'desasignado'])]);
    await expect(service.getEvaluationProgress(1)).resolves.toEqual({ completed: 1, assigned: 1 });
  });

  it('completed nunca supera assigned', async () => {
    const { service } = build([vg(['a'], ['a', 'x', 'y', 'z']), vg([], ['q'])]);
    const r = await service.getEvaluationProgress(1);
    expect(r.completed).toBeLessThanOrEqual(r.assigned);
  });

  it('consulta solo jurados activos, evaluaciones activas con puntaje y la edición pedida', async () => {
    const { service, prisma } = build([]);
    await service.getEvaluationProgress(7);
    const q = prisma.videogame.findMany.mock.calls[0][0];
    expect(q.where).toEqual({
      isActive: true,
      videogameStatus: { status: 'CONFIRMADO' },
      team: { isActive: true, editionId: 7, notGradable: false },
    });
    expect(q.select.team.select.assignedJurors.where).toEqual({ isActive: true });
    expect(q.select.evaluations.where).toEqual({
      isActive: true,
      editionId: 7,
      totalScore: { not: null },
    });
  });
});
