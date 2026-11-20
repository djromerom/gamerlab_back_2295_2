import { ForbiddenException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';

import { EvaluationService } from '../evaluation/evaluation.service';
import { GradedGamesService } from 'src/graded-games/graded-games.service';
import { PendingGamesService } from 'src/pending-games/pending-games.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * ARK-123: la puerta «evaluaciones abiertas» de los jurados debe leer la configuración de la
 * edición ACTIVA, la misma que cambia el panel de administración. Antes leía
 * `eventConfiguration.findFirst()` sin filtro, que con varias ediciones devuelve la de otra
 * edición (la fila 1) y el interruptor del admin no tenía efecto sobre los jurados.
 */
describe('Puerta de evaluaciones abiertas: configuración de la edición activa (ARK-123)', () => {
  const findFirst = jest.fn();
  const prisma = { eventConfiguration: { findFirst } } as never;

  const activeEditionFilter = {
    where: { edition: { status: EditionStatus.ACTIVE } },
  };

  const cases: Array<[string, () => Promise<unknown>]> = [
    [
      'EvaluationService',
      () =>
        new EvaluationService(
          prisma,
          {} as never,
          {} as never,
        ).createBatchEvaluations('juror-1', { evaluations: [] } as never),
    ],
    [
      'GradedGamesService',
      () =>
        new GradedGamesService(
          prisma,
          blobRefsPassthrough(),
        ).getGradedVideogamesCount('juror-1'),
    ],
    [
      'PendingGamesService (pending-games)',
      () =>
        new PendingGamesService(
          prisma,
          blobRefsPassthrough(),
        ).getPendingVideogamesCount('juror-1'),
    ],
  ];

  beforeEach(() => {
    findFirst.mockReset();
  });

  it.each(cases)(
    '%s consulta solo la configuración de la edición ACTIVE',
    async (_name, run) => {
      findFirst.mockResolvedValue({ evaluationsOpen: false });

      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);

      expect(findFirst).toHaveBeenCalledWith(activeEditionFilter);
    },
  );

  it.each(cases)(
    '%s rechaza (403) si la edición activa no tiene configuración',
    async (_name, run) => {
      findFirst.mockResolvedValue(null);

      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);

      expect(findFirst).toHaveBeenCalledWith(activeEditionFilter);
    },
  );
});
