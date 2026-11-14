import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { JurorCategory } from '@prisma/client';

import {
  ASSIGNMENT_WARNINGS_CODE,
  AssignmentValidationService,
} from './assignment-validation.service';
import { AssignmentRulesInput, RuleEvaluator } from './assignment-rules.types';
import { PrismaService } from 'src/prisma/prisma.service';

describe('AssignmentValidationService (HU-08)', () => {
  const prismaMock = {
    team: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  let service: AssignmentValidationService;

  const senior: RuleEvaluator = {
    id: 'senior',
    name: 'Luis Gómez',
    kind: 'JUROR',
    jurorCategory: JurorCategory.SENIOR,
  };

  const addSeniorTo = (
    teamCode: string,
    jurorIds: string[] = ['x1', 'x2', 'x3'],
  ): AssignmentRulesInput => ({
    teams: [{ id: 50, teamCode, editionId: 7, jurorIds }],
    evaluators: [senior],
    changes: [{ type: 'ADD', jurorId: 'senior', teamId: 50 }],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service = new AssignmentValidationService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('validate', () => {
    it('carga los grupos del jurado solo de la edición del equipo y los NRC', async () => {
      prismaMock.team.findMany
        .mockResolvedValueOnce([
          {
            id: 1,
            teamCode: 'N1-A',
            editionId: 7,
            assignedJurors: [{ id: 'senior' }],
          },
          {
            id: 2,
            teamCode: 'N1-B',
            editionId: 7,
            assignedJurors: [{ id: 'senior' }],
          },
          {
            id: 3,
            teamCode: 'N1-C',
            editionId: 7,
            assignedJurors: [{ id: 'senior' }],
          },
        ])
        .mockResolvedValueOnce([
          { id: 50, members: [{ nrcs: [{ id: 10, code: 2101 }] }] },
        ]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: 'senior', managedNrcs: [{ id: 10, code: 2101 }] },
      ]);

      const result = await service.validate(addSeniorTo('N1-D'));

      expect(result.blockers).toEqual([]);
      expect(result.warnings.map((w) => w.code).sort()).toEqual([
        'JUROR_OVER_LIMIT',
        'NRC_CONFLICT',
      ]);

      expect(prismaMock.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            editionId: { in: [7] },
            assignedJurors: { some: { id: { in: ['senior'] } } },
          },
        }),
      );
    });

    it('con bloqueos no consulta la base de datos', async () => {
      const result = await service.validate({
        ...addSeniorTo('N1-A'),
        evaluators: [{ ...senior, jurorCategory: JurorCategory.JUNIOR }],
        teams: [{ id: 50, teamCode: 'N0-COL', editionId: 7, jurorIds: [] }],
      });

      expect(result.blockers.map((b) => b.code)).toEqual([
        'SCHOOL_REQUIRES_SENIOR',
      ]);
      expect(prismaMock.team.findMany).not.toHaveBeenCalled();
    });

    it('al solo quitar jurados no consulta la base de datos', async () => {
      const result = await service.validate({
        teams: [{ id: 50, teamCode: 'N1-A', editionId: 7, jurorIds: ['x1'] }],
        evaluators: [],
        changes: [{ type: 'REMOVE', jurorId: 'x1', teamId: 50 }],
      });

      expect(result.warnings.map((w) => w.code)).toEqual(['TEAM_UNDER_MIN']);
      expect(prismaMock.team.findMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('si falla la carga devuelve VALIDATION_UNAVAILABLE en vez de un error', async () => {
      prismaMock.team.findMany.mockRejectedValue(new Error('BD caída'));
      prismaMock.user.findMany.mockResolvedValue([]);

      const result = await service.validate(addSeniorTo('N1-A'));

      expect(result.blockers).toEqual([]);
      expect(result.warnings.map((w) => w.code)).toEqual([
        'VALIDATION_UNAVAILABLE',
      ]);
    });
  });

  describe('enforce', () => {
    const warning = {
      code: 'JUROR_OVER_LIMIT' as const,
      message: 'El jurado senior Luis Gómez quedaría con 4 grupos.',
    };

    it('sin bloqueos ni advertencias deja continuar', () => {
      expect(service.enforce({ blockers: [], warnings: [] })).toEqual([]);
    });

    it('un bloqueo de regla es 400 aunque se confirme', () => {
      expect(() =>
        service.enforce(
          {
            blockers: [
              { code: 'SCHOOL_REQUIRES_SENIOR', message: 'No junior' },
            ],
            warnings: [],
          },
          true,
        ),
      ).toThrow(BadRequestException);
    });

    it('ARK-131: el equipo de otra edición es 400 EDITION_READ_ONLY con la regla en `blocker`', () => {
      let thrown: unknown;
      try {
        service.enforce({
          blockers: [
            {
              code: 'TEAM_NOT_IN_ACTIVE_EDITION',
              message: 'Solo lectura',
              teamId: 7,
            },
          ],
          warnings: [],
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        code: 'EDITION_READ_ONLY',
        blocker: 'TEAM_NOT_IN_ACTIVE_EDITION',
        message: 'Solo lectura',
        teamId: 7,
      });
    });

    it('ARK-131: los demás bloqueos llevan su propio código', () => {
      let thrown: unknown;
      try {
        service.enforce({
          blockers: [
            {
              code: 'EVALUATOR_NOT_IN_EDITION',
              message: 'No participa',
              jurorId: 'j1',
              teamId: 2,
            },
          ],
          warnings: [],
        });
      } catch (error) {
        thrown = error;
      }
      expect((thrown as BadRequestException).getResponse()).toMatchObject({
        statusCode: 400,
        code: 'EVALUATOR_NOT_IN_EDITION',
        message: 'No participa',
        jurorId: 'j1',
      });
      expect((thrown as BadRequestException).message).toBe('No participa');
    });

    it('un duplicado es 409 aunque se confirme', () => {
      expect(() =>
        service.enforce(
          {
            blockers: [{ code: 'DUPLICATE_ASSIGNMENT', message: 'Duplicado' }],
            warnings: [],
          },
          true,
        ),
      ).toThrow(ConflictException);
    });

    it('advertencias sin confirmar: 409 ASSIGNMENT_WARNINGS con la lista', () => {
      let thrown: unknown;
      try {
        service.enforce({ blockers: [], warnings: [warning] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ConflictException);
      expect((thrown as ConflictException).getResponse()).toMatchObject({
        code: ASSIGNMENT_WARNINGS_CODE,
        warnings: [warning],
        message: expect.stringContaining(warning.message) as string,
      });
    });

    it('advertencias confirmadas: continúa y las devuelve', () => {
      expect(
        service.enforce({ blockers: [], warnings: [warning] }, true),
      ).toEqual([warning]);
    });
  });

  describe('auditNote', () => {
    it('agrega los códigos aceptados sin repetir', () => {
      expect(
        AssignmentValidationService.auditNote('Asignación manual.', [
          { code: 'NRC_CONFLICT', message: 'a' },
          { code: 'NRC_CONFLICT', message: 'b' },
          { code: 'TEAM_UNDER_MIN', message: 'c' },
        ]),
      ).toBe(
        'Asignación manual. Advertencias aceptadas: NRC_CONFLICT, TEAM_UNDER_MIN.',
      );
    });

    it('sin advertencias deja la nota igual', () => {
      expect(AssignmentValidationService.auditNote('Nota.', [])).toBe('Nota.');
    });
  });
});
