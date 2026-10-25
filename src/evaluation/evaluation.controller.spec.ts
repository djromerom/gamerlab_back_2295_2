import { GUARDS_METADATA } from '@nestjs/common/constants';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { EvaluationController } from './evaluation.controller';

describe('EvaluationController', () => {
  const evaluationService = {
    createEvaluationWithDetails: jest
      .fn()
      .mockResolvedValue({ evaluationId: 1 }),
    createBatchEvaluations: jest.fn().mockResolvedValue({ results: {} }),
  };
  const controller = new EvaluationController(evaluationService as any);
  const user = { id: 'juror-1' } as any;

  beforeEach(() => jest.clearAllMocks());

  it.each(['createEvaluationWithDetails', 'createBatchEvaluations'] as const)(
    '%s exige RolePermissionGuard y el servicio "Create Evaluation"',
    (method) => {
      const handler = EvaluationController.prototype[method];

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        RolePermissionGuard,
      );
      expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, handler)).toBe(
        'Create Evaluation',
      );
    },
  );

  it('with-details pasa la Idempotency-Key al servicio', async () => {
    const body = { videogameId: 1 } as any;

    await controller.createEvaluationWithDetails(body, user, 'key-12345678');

    expect(evaluationService.createEvaluationWithDetails).toHaveBeenCalledWith(
      'juror-1',
      body,
      'key-12345678',
    );
  });

  it('batch pasa la Idempotency-Key al servicio y funciona sin ella', async () => {
    const body = { evaluations: [] } as any;

    await controller.createBatchEvaluations(body, user, 'key-12345678');
    await controller.createBatchEvaluations(body, user);

    expect(evaluationService.createBatchEvaluations).toHaveBeenNthCalledWith(
      1,
      'juror-1',
      body,
      'key-12345678',
    );
    expect(evaluationService.createBatchEvaluations).toHaveBeenNthCalledWith(
      2,
      'juror-1',
      body,
      undefined,
    );
  });
});
