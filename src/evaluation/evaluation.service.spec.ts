import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EvaluationService } from './evaluation.service';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('EvaluationService - duplicate submissions', () => {
  let service: EvaluationService;
  let prisma: any;

  const payload = {
    date: '2026-11-26T10:00:00.000Z',
    comments: 'ok',
    videogameId: 7,
    details: [
      {
        criterionId: 1,
        score: 4,
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
    ],
  } as any;

  beforeEach(() => {
    prisma = {
      eventConfiguration: {
        findFirst: jest.fn().mockResolvedValue({ evaluationsOpen: true }),
      },
      edition: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ roleId: 2, jurorCategory: null }),
      },
      criterion: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, weight: 1 }]),
      },
      evaluation: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 99 }),
      },
      $transaction: jest.fn(),
    };
    const criterionService = {
      findForSelect: jest.fn().mockResolvedValue([{ id: 1, weight: 1 }]),
    };
    service = new EvaluationService(prisma, criterionService as any);
  });

  it('with-details: responde 409 con el evaluationId existente', async () => {
    prisma.evaluation.create.mockRejectedValue(p2002());

    const err = await service
      .createEvaluationWithDetails('juror-1', payload)
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'EVALUATION_ALREADY_EXISTS',
      evaluationId: 99,
    });
  });

  it('with-details: con Idempotency-Key reproduce el resultado existente', async () => {
    prisma.evaluation.create.mockRejectedValue(p2002());

    await expect(
      service.createEvaluationWithDetails('juror-1', payload, 'key-12345678'),
    ).resolves.toMatchObject({ evaluationId: 99, replayed: true });
  });

  it('rechaza una Idempotency-Key malformada', async () => {
    await expect(
      service.createEvaluationWithDetails('juror-1', payload, 'x y'),
    ).rejects.toThrow('Idempotency-Key');
  });

  it('batch: con Idempotency-Key el duplicado cuenta como exitoso', async () => {
    prisma.$transaction.mockRejectedValueOnce(p2002());

    const res = await service.createBatchEvaluations(
      'juror-1',
      { evaluations: [payload] } as any,
      'key-12345678',
    );

    expect(res.results.failed).toEqual([]);
    expect(res.results.successful).toEqual([
      { videogameId: 7, evaluationId: 99, replayed: true },
    ]);
  });

  it('with-details: errores no relacionados se propagan', async () => {
    prisma.evaluation.create.mockRejectedValue(new Error('boom'));

    await expect(
      service.createEvaluationWithDetails('juror-1', payload),
    ).rejects.toThrow('boom');
  });

  it('batch: marca la fila duplicada con código estable y sigue con las demás', async () => {
    prisma.$transaction
      .mockRejectedValueOnce(p2002())
      .mockResolvedValueOnce({ videogameId: 8, evaluationId: 100 });

    const res = await service.createBatchEvaluations('juror-1', {
      evaluations: [payload, { ...payload, videogameId: 8 }],
    } as any);

    expect(res.results.failed).toEqual([
      {
        videogameId: 7,
        error: 'EVALUATION_ALREADY_EXISTS',
        evaluationId: 99,
      },
    ]);
    expect(res.results.successful).toEqual([
      { videogameId: 8, evaluationId: 100 },
    ]);
  });
});
