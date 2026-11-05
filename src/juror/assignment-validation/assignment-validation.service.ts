import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { EDITION_READ_ONLY } from '../../editions/active-edition';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateAssignmentChanges, findBlockers } from './assignment-rules';
import {
  AssignmentRulesInput,
  AssignmentValidationResult,
  AssignmentWarning,
  AssignmentWarningContext,
  RuleNrc,
} from './assignment-rules.types';

export const ASSIGNMENT_WARNINGS_CODE = 'ASSIGNMENT_WARNINGS';

/**
 * HU-08 (ARK-102): punto único de validación de asignaciones de jurados.
 * Las reglas viven en `assignment-rules.ts`; aquí solo se cargan los datos
 * que necesitan las advertencias y se decide si se puede guardar.
 */
@Injectable()
export class AssignmentValidationService {
  private readonly logger = new Logger(AssignmentValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bloqueos con los datos que ya trae quien llama; advertencias con datos
   * extra de la BD. Si esa carga falla, devuelve VALIDATION_UNAVAILABLE en
   * lugar de un error: los bloqueos se aplican igual.
   */
  async validate(
    input: AssignmentRulesInput,
  ): Promise<AssignmentValidationResult> {
    const blockers = findBlockers(input);
    if (blockers.length > 0) return { blockers, warnings: [] };

    let context: AssignmentWarningContext | null;
    try {
      context = await this.loadWarningContext(input);
    } catch (error) {
      this.logger.error(
        'No se pudieron cargar los datos para validar la asignación:',
        error,
      );
      context = null;
    }

    return evaluateAssignmentChanges(input, context);
  }

  /**
   * Lanza el primer bloqueo (400 con `code`, o 409 si es duplicado). Con advertencias
   * sin confirmar lanza 409 `ASSIGNMENT_WARNINGS` y no se guarda nada.
   * Devuelve las advertencias aceptadas.
   */
  enforce(
    result: AssignmentValidationResult,
    confirmWarnings = false,
  ): AssignmentWarning[] {
    const [blocker] = result.blockers;
    if (blocker) {
      if (blocker.code === 'DUPLICATE_ASSIGNMENT') {
        throw new ConflictException(blocker.message);
      }
      // ARK-131: `code` permite al front distinguir el bloqueo. El equipo de otra edición
      // responde con el mismo código que el resto de escrituras de HU-27 (EDITION_READ_ONLY);
      // `blocker` conserva la regla exacta que falló.
      throw new BadRequestException({
        statusCode: 400,
        code:
          blocker.code === 'TEAM_NOT_IN_ACTIVE_EDITION'
            ? EDITION_READ_ONLY
            : blocker.code,
        blocker: blocker.code,
        message: blocker.message,
        ...(blocker.teamId !== undefined ? { teamId: blocker.teamId } : {}),
        ...(blocker.jurorId !== undefined ? { jurorId: blocker.jurorId } : {}),
      });
    }

    if (result.warnings.length > 0 && !confirmWarnings) {
      throw new ConflictException({
        statusCode: 409,
        code: ASSIGNMENT_WARNINGS_CODE,
        message: [
          'La asignación rompe reglas de asignación. Confirma para continuar:',
          ...result.warnings.map((warning) => `- ${warning.message}`),
        ].join('\n'),
        warnings: result.warnings,
      });
    }

    return result.warnings;
  }

  /** Texto para la bitácora cuando el administrador aceptó advertencias. */
  static auditNote(base: string, accepted: AssignmentWarning[]): string {
    if (accepted.length === 0) return base;
    const codes = [...new Set(accepted.map((warning) => warning.code))];
    return `${base} Advertencias aceptadas: ${codes.join(', ')}.`;
  }

  private async loadWarningContext(
    input: AssignmentRulesInput,
  ): Promise<AssignmentWarningContext> {
    const context: AssignmentWarningContext = {
      teamsByJuror: new Map(),
      managedNrcsByJuror: new Map(),
      nrcsByTeam: new Map(),
    };

    const addedJurorIds = [
      ...new Set(
        input.changes.filter((c) => c.type === 'ADD').map((c) => c.jurorId),
      ),
    ];
    if (addedJurorIds.length === 0) return context;

    const editionIds = [...new Set(input.teams.map((team) => team.editionId))];
    const teamIds = input.teams.map((team) => team.id);
    const activeNrc = {
      where: { isActive: true },
      select: { id: true, code: true },
    };

    const [assignedTeams, evaluators, teamsWithNrcs] = await Promise.all([
      this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: { in: editionIds },
          assignedJurors: { some: { id: { in: addedJurorIds } } },
        },
        select: {
          id: true,
          teamCode: true,
          editionId: true,
          assignedJurors: {
            where: { id: { in: addedJurorIds } },
            select: { id: true },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: addedJurorIds } },
        select: { id: true, managedNrcs: activeNrc },
      }),
      this.prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          members: {
            where: { isActive: true },
            select: { nrcs: activeNrc },
          },
        },
      }),
    ]);

    for (const team of assignedTeams) {
      for (const { id: jurorId } of team.assignedJurors) {
        const list = context.teamsByJuror.get(jurorId) ?? [];
        list.push({
          id: team.id,
          teamCode: team.teamCode,
          editionId: team.editionId,
        });
        context.teamsByJuror.set(jurorId, list);
      }
    }

    for (const evaluator of evaluators) {
      context.managedNrcsByJuror.set(evaluator.id, evaluator.managedNrcs);
    }

    for (const team of teamsWithNrcs) {
      const nrcs: RuleNrc[] = team.members.flatMap((member) => member.nrcs);
      context.nrcsByTeam.set(team.id, nrcs);
    }

    return context;
  }
}
