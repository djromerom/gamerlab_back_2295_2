import { ConflictException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';

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
    const service = new EvaluationService(prisma, { findForSelect: jest.fn() } as any);
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
