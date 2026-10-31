import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { UNVERIFIED_TEAM_MESSAGE } from '../team-verification/team-verification.service';

describe('EvaluationService - verificación del grupo (HU-19)', () => {
  let service: EvaluationService;

  const prismaMock = {
    eventConfiguration: { findFirst: jest.fn() },
    edition: { findFirst: jest.fn() },
    role: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    criterion: { findMany: jest.fn() },
    evaluation: { create: jest.fn(), findUnique: jest.fn() },
    evaluationIdempotency: { findUnique: jest.fn(), create: jest.fn() },
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
    prismaMock.role.findUnique.mockResolvedValue({ id: 3 });
    prismaMock.user.findUnique.mockResolvedValue({
      roleId: 2,
      jurorCategory: 'JUNIOR',
    });
    prismaMock.criterion.findMany.mockResolvedValue([{ id: 1, weight: 1 }]);
    criterionServiceMock.findForSelect.mockResolvedValue([
      { id: 1, weight: 1 },
    ]);
    prismaMock.evaluation.create.mockResolvedValue({ id: 99 });
    prismaMock.evaluation.findUnique.mockResolvedValue(null);
    prismaMock.evaluationIdempotency.findUnique.mockResolvedValue(null);
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
    verificationMock.findUnverifiedVideogameIds.mockResolvedValue(
      new Set([8]),
    );

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
    verificationMock.findUnverifiedVideogameIds.mockResolvedValue(
      new Set([8]),
    );
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
});

describe('EvaluationService batch idempotency', () => {
  const payload: any = {
    evaluations: [1, 2].map((videogameId) => ({
      videogameId,
      date: '2026-10-24T12:00:00.000Z',
      comments: `game-${videogameId}`,
      details: [{ criterionId: 1, score: 4, createdAt: '2026-10-24T12:00:00.000Z', updatedAt: '2026-10-24T12:00:00.000Z' }],
    })),
  };

  function setup() {
    const evaluations = new Map<number, { id: number; contentHash: string }>();
    const receipts = new Map<string, any>();
    let nextId = 1;
    let transactionTail = Promise.resolve();
    const prisma: any = {
      eventConfiguration: { findFirst: jest.fn().mockResolvedValue({ evaluationsOpen: true }) },
      edition: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ roleId: 1, jurorCategory: null }) },
      criterion: { findMany: jest.fn().mockResolvedValue([{ id: 1, weight: 1 }]) },
      $transaction: jest.fn((callback: any) => {
        const current = transactionTail.then(() => callback(tx));
        transactionTail = current.then(() => undefined, () => undefined);
        return current;
      }),
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      evaluationIdempotency: {
        findUnique: jest.fn(async ({ where }: any) => receipts.get(where.jurorId_key.key) ?? null),
        create: jest.fn(async ({ data }: any) => { receipts.set(data.key, data); return data; }),
      },
      evaluation: {
        findUnique: jest.fn(async ({ where }: any) => evaluations.get(where.jurado_videojuego_unique.videogameId) ?? null),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: nextId++, contentHash: data.contentHash };
          evaluations.set(data.videogameId, row);
          return row;
        }),
      },
    };
    // HU-19: en estas pruebas todos los grupos están verificados
    const verification = { findUnverifiedVideogameIds: jest.fn().mockResolvedValue(new Set()) };
    const service = new EvaluationService(prisma, { findForSelect: jest.fn() } as any, verification as any);
    return { service, prisma, tx, evaluations, receipts };
  }

  it('recovers rows left by an interrupted attempt and completes the response', async () => {
    const { service, prisma, evaluations, receipts } = setup();
    // Simulate durable rows from a process that died before writing its receipt.
    const hash = (service as any).contentHash(payload.evaluations[0]);
    evaluations.set(1, { id: 41, contentHash: hash });
    const response = await service.createBatchEvaluations('juror-1', payload, 'retry-key');
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

  it('rejects changed content for a completed key or an existing row', async () => {
    const { service } = setup();
    await service.createBatchEvaluations('juror-1', payload, 'same-key');
    await expect(service.createBatchEvaluations('juror-1', { evaluations: [payload.evaluations[0]] } as any, 'same-key'))
      .rejects.toBeInstanceOf(ConflictException);

    const changed = structuredClone(payload);
    changed.evaluations[0].comments = 'different';
    await expect(service.createBatchEvaluations('juror-1', changed))
      .rejects.toThrow(/evaluación distinta/i);
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
    expect(q.where).toEqual({ isActive: true, team: { isActive: true, editionId: 7 } });
    expect(q.select.team.select.assignedJurors.where).toEqual({ isActive: true });
    expect(q.select.evaluations.where).toEqual({
      isActive: true,
      editionId: 7,
      totalScore: { not: null },
    });
  });
});
