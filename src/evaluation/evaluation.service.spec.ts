import { ForbiddenException } from '@nestjs/common';
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
    evaluation: { create: jest.fn() },
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
});
