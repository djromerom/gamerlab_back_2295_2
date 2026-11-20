import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ManualJurorAssignmentAction } from '@prisma/client';
import {
  EDITION_READ_ONLY,
  requireActiveEdition,
} from 'src/editions/active-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { AssignmentPushNotifier } from 'src/push-notifications/assignment-push-notifier.service';
import { SubstituteNoticesService } from 'src/jurors/substitute-notices/substitute-notices.service';
import { AssignmentWarning } from '../assignment-validation/assignment-rules.types';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';
import { BulkAssignTeamsDto } from '../dto/bulk-assign-teams.dto';
import {
  BulkBlock,
  BulkTeamStatus,
  blocksByTeam,
  isJurorLevelBlocker,
  statusOf,
  summaryMessage,
  warningsForTeam,
} from './bulk-assignment.logic';
import { JurorAssignmentAuditService } from './juror-assignment-audit.service';
import { JurorAssignmentService } from './juror-assignment.service';

type Team = Awaited<ReturnType<JurorAssignmentService['findActiveTeam']>>;

export const BULK_AUDIT_NOTE = 'Asignación manual en lote desde módulo admin.';

export interface BulkTeamResult {
  equipoId: number;
  codigo: string | null;
  nombre: string | null;
  videojuego: string | null;
  estado: BulkTeamStatus;
  /** Advertencias que el administrador aceptó para este equipo (vacío si no hubo o si no se asignó). */
  advertencias: AssignmentWarning[];
  /** Jurados del equipo después de asignar (solo si se asignó). */
  cantidadJurados: number | null;
  /** Por qué no se asignó (solo con `estado: BLOCKED`). */
  bloqueo: BulkBlock | null;
}

/** Un equipo que no se pudo cargar o que no admite jurados, traducido a un bloqueo. */
function blockFromError(error: unknown): BulkBlock {
  if (error instanceof NotFoundException) {
    return { code: 'TEAM_NOT_FOUND', message: error.message };
  }
  if (error instanceof BadRequestException) {
    const body = error.getResponse() as { code?: string; message?: string };
    return {
      code: body.code ?? 'BLOCKED',
      message: body.message ?? error.message,
    };
  }
  if (error instanceof HttpException) {
    return { code: 'BLOCKED', message: error.message };
  }
  throw error;
}

/**
 * HU-42 (ARK-275): asigna varios equipos a un jurado en una sola operación.
 *
 * Reutiliza lo de `JurorAssignmentService.assign` (jurado, equipo de la edición activa y
 * confirmado, reglas de HU-08, aviso al suplente y bitácora) con estas diferencias:
 * - **Por equipo:** un equipo que no existe o tiene un bloqueo no se asigna y se informa con su
 *   motivo; los demás siguen. Un problema del jurado (no existe, no participa) frena todo (4xx).
 * - **Advertencias juntas:** se calculan sobre los equipos que sí se asignan (por ejemplo «más
 *   de 3 grupos»). Sin `confirmWarnings`, 409 `ASSIGNMENT_WARNINGS` con la lista de advertencias y
 *   de equipos bloqueados, y no se guarda nada.
 * - **Una transacción** para todos los equipos válidos: si algo falla, no se asigna ninguno.
 * - **Un solo aviso** push al jurado y un solo aviso al suplente con todos sus equipos, después
 *   de confirmar. Una fila de bitácora `ASSIGN` por equipo.
 * - Si todos los equipos quedan bloqueados responde 200 con todos en `BLOCKED` (nada se guarda).
 */
@Injectable()
export class JurorAssignmentBulkService {
  private readonly logger = new Logger(JurorAssignmentBulkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: JurorAssignmentService,
    private readonly jurorAssignmentAuditService: JurorAssignmentAuditService,
    private readonly assignmentValidation: AssignmentValidationService,
    // HU-37: después de confirmar la transacción; no espera ni puede fallar.
    private readonly pushNotifier: AssignmentPushNotifier,
    // HU-22: aviso al suplente dentro de la transacción; el correo, después.
    private readonly substituteNotices: SubstituteNoticesService,
  ) {}

  async assignMany(dto: BulkAssignTeamsDto, actorUserId: string) {
    const jurorId = dto.jurorId;
    const teamIds = [...new Set(dto.teamIds)];

    try {
      const edition = await requireActiveEdition(this.prisma);
      const evaluator = await this.assignments.findEvaluatorToAdd(
        jurorId,
        edition,
      );

      // 1. Cada equipo con las mismas comprobaciones de `assign`.
      // `known`: equipos que existen y son de la edición activa (se muestran en el resultado);
      // `loaded`: los que además admiten jurados.
      const known = new Map<number, Team>();
      const loaded = new Map<number, Team>();
      const blocked = new Map<number, BulkBlock>();
      for (const teamId of teamIds) {
        try {
          const team = await this.assignments.findActiveTeam(teamId, edition);
          known.set(teamId, team);
          this.assignments.assertTeamConfirmed(team);
          loaded.set(teamId, team);
        } catch (error) {
          blocked.set(teamId, blockFromError(error));
        }
      }

      // 2. Reglas de HU-08 sobre todos los equipos a la vez. Con bloqueos no hay advertencias, así
      //    que se sacan los equipos bloqueados y se vuelve a validar el resto.
      let remaining = [...loaded.values()];
      let warnings: AssignmentWarning[] = [];
      while (remaining.length > 0) {
        const result = await this.assignmentValidation.validate({
          activeEdition: { id: edition.id, title: edition.title },
          teams: remaining.map((team) => this.assignments.toRuleTeam(team)),
          evaluators: [this.assignments.toRuleEvaluator(evaluator)],
          changes: remaining.map((team) => ({
            type: 'ADD' as const,
            jurorId,
            teamId: team.id,
          })),
        });
        if (result.blockers.length === 0) {
          warnings = result.warnings;
          break;
        }
        // Un problema del jurado frena todo (400), igual que en `assign`.
        const jurorBlocker = result.blockers.find(isJurorLevelBlocker);
        if (jurorBlocker) {
          this.assignmentValidation.enforce({
            blockers: [jurorBlocker],
            warnings: [],
          });
        }
        const blocks = blocksByTeam(
          result.blockers,
          remaining.map((team) => team.id),
          EDITION_READ_ONLY,
        );
        if (blocks.size === 0) {
          // Un bloqueo que no es de ningún equipo pendiente no debería existir; se frena por seguridad.
          const [first] = result.blockers;
          for (const team of remaining) {
            blocked.set(team.id, { code: first.code, message: first.message });
          }
          remaining = [];
          break;
        }
        for (const [teamId, block] of blocks) blocked.set(teamId, block);
        remaining = remaining.filter((team) => !blocks.has(team.id));
      }

      // 3. Advertencias sin confirmar: 409 con las advertencias y los equipos bloqueados.
      let accepted: AssignmentWarning[] = [];
      if (remaining.length > 0) {
        accepted = this.assignmentValidation.enforce(
          { blockers: [], warnings },
          dto.confirmWarnings ?? false,
          {
            blocked: teamIds
              .filter((teamId) => blocked.has(teamId))
              .map((teamId) => ({
                teamId,
                codigo: known.get(teamId)?.teamCode ?? null,
                ...blocked.get(teamId),
              })),
          },
        );
      }

      // 4. Guardar todos los equipos válidos en una sola transacción.
      if (remaining.length > 0) {
        const noticeId = await this.prisma.$transaction(
          async (tx) => {
            for (const team of remaining) {
              await tx.team.update({
                where: { id: team.id },
                data: { assignedJurors: { connect: { id: jurorId } } },
              });
            }
            const notice = await this.substituteNotices.recordAssignment(tx, {
              jurorId,
              teamIds: remaining.map((team) => team.id),
              editionId: edition.id,
            });
            for (const team of remaining) {
              await this.jurorAssignmentAuditService.create(
                {
                  action: ManualJurorAssignmentAction.ASSIGN,
                  actorUserId,
                  teamId: team.id,
                  jurorId,
                  newJurorId: jurorId,
                  notes: AssignmentValidationService.auditNote(
                    BULK_AUDIT_NOTE,
                    warningsForTeam(accepted, team.id),
                  ),
                },
                tx,
              );
            }
            return notice;
          },
          { maxWait: 10_000, timeout: 60_000 },
        );

        // Un solo aviso por operación, no uno por equipo (HU-37 / HU-22).
        this.pushNotifier.notifyAssignmentChanged([jurorId]);
        this.substituteNotices.sendEmailAfterCommit([noticeId]);
      }

      // 5. Resultado por equipo, en el orden en que se pidieron.
      const assignedIds = new Set(remaining.map((team) => team.id));
      const resultados: BulkTeamResult[] = teamIds.map((teamId) => {
        const team = known.get(teamId);
        if (assignedIds.has(teamId) && team) {
          const teamWarnings = warningsForTeam(accepted, teamId);
          return {
            equipoId: teamId,
            codigo: team.teamCode,
            nombre: team.teamName,
            videojuego: team.videogame?.name ?? null,
            estado: statusOf(teamWarnings),
            advertencias: teamWarnings,
            cantidadJurados: team.assignedJurors.length + 1,
            bloqueo: null,
          };
        }
        return {
          equipoId: teamId,
          codigo: team?.teamCode ?? null,
          nombre: team?.teamName ?? null,
          videojuego: team?.videogame?.name ?? null,
          estado: 'BLOCKED',
          advertencias: [],
          cantidadJurados: null,
          bloqueo: blocked.get(teamId) ?? null,
        };
      });

      return {
        message: summaryMessage(
          assignedIds.size,
          teamIds.length - assignedIds.size,
        ),
        edicion: { id: edition.id, title: edition.title },
        jurado: {
          id: evaluator.id,
          nombre:
            `${evaluator.firstName ?? ''} ${evaluator.lastName ?? ''}`.trim(),
        },
        resultados,
        totales: {
          solicitados: teamIds.length,
          asignados: assignedIds.size,
          bloqueados: teamIds.length - assignedIds.size,
        },
        advertenciasAceptadas: accepted,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Error al asignar equipos en lote a un jurado:', error);
      throw new InternalServerErrorException(
        'No se pudieron asignar los equipos. Se revirtió todo y no cambió ninguna asignación.',
      );
    }
  }
}
