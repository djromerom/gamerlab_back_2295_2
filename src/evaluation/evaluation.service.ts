import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EditionStatus, JurorCategory, Prisma } from '@prisma/client';
import { CriterionService } from 'src/criterion/criterion.service';
import {
  TeamVerificationService,
  UNVERIFIED_TEAM_MESSAGE,
} from '../team-verification/team-verification.service';
import { isCollegeTeamCode } from '../team-verification/verification-code.util';
import { PrismaService } from '../prisma/prisma.service';
import { BatchEvaluationDto } from './dto/batchEvaluation.dto';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { CreateDetailEvaluationDto } from './dto/createEvaluationDetails.dto';
import { createHash } from 'crypto';
import { countProgress } from './evaluation-progress';
import { ACTIVE_EDITION_CONFIG_WHERE } from '../settings/active-edition-config';

/** Quien califica: el usuario de la sesión. */
type EvaluationActor = {
  id: string;
  roleId: number;
  jurorCategory: JurorCategory | null;
};

type BatchResults = {
  successful: { videogameId: number; evaluationId: number }[];
  failed: { videogameId: number; error: string }[];
};

type BatchResponse = { results: BatchResults; message: string };

/** Fila del lote ya validada en memoria (fase a): o lleva su error o lo que se va a escribir. */
type PreparedRow =
  | { videogameId: number; error: string }
  | {
      videogameId: number;
      error?: undefined;
      rowHash: string;
      data: Prisma.EvaluationUncheckedCreateInput;
    };

const MAX_SCORE = 5;
const MAX_SERIALIZATION_ATTEMPTS = 3;

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly criterionService: CriterionService,
    private readonly teamVerification: TeamVerificationService,
  ) {}

  private async checkEvaluationsOpen() {
    const config = await this.prisma.eventConfiguration.findFirst({
      where: ACTIVE_EDITION_CONFIG_WHERE,
    });

    if (!config?.evaluationsOpen) {
      throw new ForbiddenException(
        'Las evaluaciones no están habilitadas en este momento.',
      );
    }
  }

  /**
   * Creates an evaluation and its details in a single query.
   * @param jurorId string
   * @param evaluationPayload object with comments, videogameId, details (array). `date` and the
   * detail timestamps are set by the server; `totalScore` and `isSenior` are computed here.
   */
  async createEvaluationWithDetails(
    jurorId: string,
    evaluationPayload: CreateEvaluationDto,
    idempotencyKey?: string,
  ) {
    const contentHash = this.contentHash(evaluationPayload);
    if (idempotencyKey) {
      const prior = await this.prisma.evaluationIdempotency.findUnique({ where: { jurorId_key: { jurorId, key: idempotencyKey } } });
      if (prior) return this.replayRequest(prior, contentHash);
    }
    await this.checkEvaluationsOpen();

    const { comments, videogameId, details } = evaluationPayload;

    const activeEdition = await this.findActiveEdition();
    const { actor, professorRoleId, isSenior } = await this.loadActor(jurorId);

    // U1: asignación, edición activa y regla de colegios
    const blockers = await this.findEvaluationBlockers(
      actor,
      [videogameId],
      activeEdition.id,
      professorRoleId,
    );
    const blocker = blockers.get(videogameId);
    if (blocker) {
      throw new ForbiddenException(blocker);
    }

    // HU-19: el jurado debe haber digitado el código del grupo
    await this.teamVerification.assertVerified(jurorId, videogameId);

    const activeCriteria = await this.criterionService.findForSelect();

    if (!activeCriteria || activeCriteria.length === 0) {
      throw new BadRequestException('No active evaluation criteria found.');
    }

    const now = new Date();
    const { detailsData, totalScore } = this.buildDetails(
      details,
      this.criteriaWeightMap(activeCriteria),
      now,
    );

    const createData: Prisma.EvaluationUncheckedCreateInput = {
      jurorId,
      date: now,
      comments,
      videogameId,
      // Tras la regla 2 de findEvaluationBlockers, la edición del equipo es la activa.
      editionId: activeEdition.id,
      isSenior,
      contentHash,
      idempotencyKey: idempotencyKey ?? null,
      totalScore,
      details: {
        create: detailsData,
      },
    };

    let evaluation;
    try {
      evaluation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.evaluation.create({ data: createData, select: { id: true } });
        const response = { evaluationId: created.id, message: 'Evaluación y detalles guardados correctamente' };
        if (idempotencyKey) await tx.evaluationIdempotency.create({ data: { jurorId, key: idempotencyKey, contentHash, response } });
        return created;
      });
    } catch (error) {
      const existing = await this.prisma.evaluation.findUnique({
        where: { jurado_videojuego_unique: { jurorId, videogameId } },
        select: { id: true, contentHash: true },
      });
      if (existing) {
        if (existing.contentHash === contentHash) return { evaluationId: existing.id, message: 'Evaluación y detalles guardados correctamente' };
        throw new ConflictException('Ya existe una evaluación para este videojuego con contenido distinto.');
      }
      if (idempotencyKey) {
        const replay = await this.prisma.evaluationIdempotency.findUnique({ where: { jurorId_key: { jurorId, key: idempotencyKey } } });
        if (replay) return this.replayRequest(replay, contentHash);
      }
      throw error;
    }

    return {
      evaluationId: evaluation.id,
      message: 'Evaluación y detalles guardados correctamente',
    };
  }

  /** Resuelve la edición (activa por defecto) y devuelve su progreso. */
  async getEvaluationProgressForEdition(editionId?: number) {
    let id = editionId;
    if (id === undefined) {
      const active = await this.prisma.edition.findFirst({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      if (!active) return { completed: 0, assigned: 0 };
      id = active.id;
    }
    return this.getEvaluationProgress(id);
  }

  /**
   * Progreso de evaluación de una edición: evaluaciones (activas, con puntaje)
   * de jurados actualmente asignados y activos, sobre las asignaciones vigentes.
   * Fuente única para Estadísticas, Estado Eval. y Asignación de jurados.
   */
  async getEvaluationProgress(
    editionId: number,
  ): Promise<{ completed: number; assigned: number }> {
    const videogames = await this.prisma.videogame.findMany({
      where: { isActive: true, team: { isActive: true, editionId } },
      select: {
        team: { select: { assignedJurors: { where: { isActive: true }, select: { id: true } } } },
        evaluations: {
          where: { isActive: true, editionId, totalScore: { not: null } },
          select: { jurorId: true },
        },
      },
    });

    let completed = 0;
    let assigned = 0;
    for (const vg of videogames) {
      const progress = countProgress(
        vg.team.assignedJurors.map((j) => j.id),
        vg.evaluations.map((e) => e.jurorId),
      );
      completed += progress.completed;
      assigned += progress.assigned;
    }
    return { completed, assigned };
  }

  /**
   * Lote de evaluaciones (U2). Fases:
   * (a) cada fila se valida en memoria (bloqueos U1, verificación HU-19, criterios y puntajes);
   *     las inválidas van a `failed` con un mensaje propio;
   * (b) solo las válidas se escriben, todas en una única transacción Serializable, sin tragar
   *     errores de BD: si una escritura falla, sale el error (500) y no se guarda nada ni el recibo;
   * (c) `results` se arma dentro de la función que se reintenta (hasta 3 veces, solo ante P2034);
   * (d) el recibo de idempotencia se crea al final de esa misma transacción.
   */
  async createBatchEvaluations(
    jurorId: string,
    batchPayload: BatchEvaluationDto,
    idempotencyKey?: string,
  ): Promise<BatchResponse> {
    const contentHash = this.contentHash(batchPayload);
    await this.checkEvaluationsOpen();

    const rows = batchPayload.evaluations;
    const videogameIds = rows.map((e) => e.videogameId);

    // --- Lecturas globales, una sola vez para todo el lote ---
    // HU-19: grupos cuyo código el jurado aún no digitó
    const unverifiedVideogameIds =
      await this.teamVerification.findUnverifiedVideogameIds(
        jurorId,
        videogameIds,
      );

    const activeEdition = await this.findActiveEdition();
    const { actor, professorRoleId, isSenior } = await this.loadActor(jurorId);

    const activeCriteria = await this.prisma.criterion.findMany({
      where: { isActive: true },
    });

    if (!activeCriteria || activeCriteria.length === 0) {
      throw new BadRequestException('No active evaluation criteria found.');
    }
    const criteriaWeightMap = this.criteriaWeightMap(activeCriteria);

    // U1: asignación, edición activa y regla de colegios
    const blockers = await this.findEvaluationBlockers(
      actor,
      videogameIds,
      activeEdition.id,
      professorRoleId,
    );

    // --- (a) Validación en memoria, fila por fila ---
    const now = new Date();
    const seen = new Set<number>();
    const prepared: PreparedRow[] = rows.map((row) => {
      const { videogameId } = row;
      if (seen.has(videogameId)) {
        return {
          videogameId,
          error: 'El videojuego está repetido en el lote',
        };
      }
      seen.add(videogameId);

      const blocker = blockers.get(videogameId);
      if (blocker) return { videogameId, error: blocker };

      // Una repetición idempotente responde antes (dentro de la transacción) sin mirar esto
      if (unverifiedVideogameIds.has(videogameId)) {
        return { videogameId, error: UNVERIFIED_TEAM_MESSAGE };
      }

      try {
        const { detailsData, totalScore } = this.buildDetails(
          row.details,
          criteriaWeightMap,
          now,
        );
        const rowHash = this.contentHash(row);
        return {
          videogameId,
          rowHash,
          data: {
            jurorId,
            date: now,
            comments: row.comments,
            videogameId,
            editionId: activeEdition.id,
            isSenior,
            contentHash: rowHash,
            idempotencyKey: null,
            totalScore,
            details: { create: detailsData },
          },
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          return { videogameId, error: error.message };
        }
        throw error;
      }
    });

    const validIds = prepared
      .filter((row) => !row.error)
      .map((row) => row.videogameId);

    // --- (b)-(d) Escritura: todo o nada, dentro de la transacción que se reintenta ---
    const processBatch = async (
      tx: Prisma.TransactionClient,
    ): Promise<BatchResponse> => {
      // A transaction-scoped advisory lock serializes requests using the same key,
      // including the first request that has not inserted its durable receipt yet.
      if (idempotencyKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${jurorId}), hashtext(${idempotencyKey}))`;
        const prior = await tx.evaluationIdempotency.findUnique({ where: { jurorId_key: { jurorId, key: idempotencyKey } } });
        if (prior) return this.replayRequest(prior, contentHash);
      }

      // Se arma en cada intento: un reintento por P2034 no deja filas de la pasada anterior.
      const results: BatchResults = { successful: [], failed: [] };

      // Consulta previa de existentes: el contenido distinto se informa por fila, sin escribir.
      const existingRows = validIds.length
        ? await tx.evaluation.findMany({
            where: { jurorId, videogameId: { in: validIds } },
            select: { id: true, videogameId: true, contentHash: true },
          })
        : [];
      const existingByGame = new Map(
        existingRows.map((row) => [row.videogameId, row]),
      );

      for (const row of prepared) {
        if (row.error !== undefined) {
          results.failed.push({
            videogameId: row.videogameId,
            error: row.error,
          });
          continue;
        }

        const existing = existingByGame.get(row.videogameId);
        if (existing) {
          if (existing.contentHash === row.rowHash) {
            results.successful.push({
              videogameId: row.videogameId,
              evaluationId: existing.id,
            });
          } else {
            results.failed.push({
              videogameId: row.videogameId,
              error: `Ya existe una evaluación distinta para el videojuego ${row.videogameId}.`,
            });
          }
          continue;
        }

        // Sin try/catch: un error de BD aborta la transacción y sale como 500, sin recibo.
        const evaluation = await tx.evaluation.create({
          data: row.data,
          select: { id: true },
        });
        results.successful.push({
          videogameId: row.videogameId,
          evaluationId: evaluation.id,
        });
      }

      const response: BatchResponse = {
        results,
        message: `Procesadas ${rows.length} evaluaciones: ${results.successful.length} exitosas, ${results.failed.length} fallidas`,
      };
      if (idempotencyKey) await tx.evaluationIdempotency.create({ data: { jurorId, key: idempotencyKey, contentHash, response } });
      return response;
    };

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(processBatch, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isSerializationFailure =
          (error as { code?: string } | null)?.code === 'P2034';
        if (!isSerializationFailure || attempt >= MAX_SERIALIZATION_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  /**
   * U1: por cada videojuego, el motivo por el que el actor no puede calificarlo
   * (ausente en el mapa = permitido). Una sola consulta para toda la lista. Reglas, en orden:
   * 1. el juego no existe, está inactivo o su equipo está inactivo;
   * 2. el equipo no es de la edición activa;
   * 3. equipo de colegios (N0) y el actor no es senior (Profesor o jurado SENIOR);
   * 4. el actor no está asignado al equipo ni es Profesor dueño de un NRC activo de algún
   *    integrante activo en la edición del equipo (aplica también a colegios).
   * `professorRoleId` es opcional para no repetir la consulta del rol si el llamador ya la hizo.
   */
  private async findEvaluationBlockers(
    actor: EvaluationActor,
    videogameIds: number[],
    activeEditionId: number,
    professorRoleId?: number,
  ): Promise<Map<number, string>> {
    const roleId =
      professorRoleId === undefined
        ? await this.findProfessorRoleId()
        : professorRoleId;
    const isProfessor = roleId !== undefined && actor.roleId === roleId;
    const isSenior = this.isSeniorActor(actor, roleId);

    const videogames = await this.prisma.videogame.findMany({
      where: { id: { in: videogameIds } },
      select: {
        id: true,
        isActive: true,
        team: {
          select: {
            id: true,
            teamCode: true,
            editionId: true,
            isActive: true,
            assignedJurors: { where: { id: actor.id }, select: { id: true } },
            members: {
              where: { isActive: true },
              select: {
                nrcs: {
                  where: { professorId: actor.id, isActive: true },
                  select: { editionId: true },
                },
              },
            },
          },
        },
      },
    });
    const byId = new Map(videogames.map((v) => [v.id, v]));

    const blockers = new Map<number, string>();
    for (const videogameId of videogameIds) {
      const videogame = byId.get(videogameId);
      const team = videogame?.team;

      if (!videogame?.isActive || !team || !team.isActive) {
        blockers.set(videogameId, 'El videojuego no existe o está inactivo');
        continue;
      }

      if (team.editionId !== activeEditionId) {
        blockers.set(
          videogameId,
          'El videojuego no pertenece a la edición activa',
        );
        continue;
      }

      if (isCollegeTeamCode(team.teamCode) && !isSenior) {
        blockers.set(
          videogameId,
          'Los equipos de colegios solo los califica un evaluador senior',
        );
        continue;
      }

      const isAssigned = team.assignedJurors.length > 0;
      const ownsMemberNrc =
        isProfessor &&
        team.members.some((member) =>
          member.nrcs.some((nrc) => nrc.editionId === team.editionId),
        );
      if (!isAssigned && !ownsMemberNrc) {
        blockers.set(videogameId, 'Este grupo no está asignado al evaluador');
      }
    }
    return blockers;
  }

  /**
   * #4: cada criterio activo aparece exactamente una vez. Los criterios inexistentes o
   * inactivos los rechaza `buildDetails` con su propio mensaje.
   */
  private assertCompleteDetails(
    details: { criterionId: number }[],
    activeCriteriaIds: Set<number>,
  ): void {
    const seen = new Set<number>();
    for (const { criterionId } of details) {
      if (seen.has(criterionId)) {
        throw new BadRequestException(
          `El criterio ${criterionId} está repetido en la evaluación.`,
        );
      }
      seen.add(criterionId);
    }

    const missing = [...activeCriteriaIds].filter((id) => !seen.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan puntajes para los criterios activos: ${missing.join(', ')}.`,
      );
    }
  }

  /**
   * Valida los puntajes y arma los detalles a guardar. Las fechas las fija el servidor (M8)
   * y el total ponderado nunca supera 5 (#4). Lanza BadRequestException con mensaje propio.
   */
  private buildDetails(
    details: CreateDetailEvaluationDto[],
    criteriaWeightMap: Map<number, number>,
    now: Date,
  ) {
    if (!Array.isArray(details) || details.length === 0) {
      throw new BadRequestException(
        'La evaluación debe incluir los puntajes por criterio.',
      );
    }

    let totalScore = 0;
    const detailsData = details.map((detail) => {
      const weight = criteriaWeightMap.get(detail.criterionId);

      if (weight === undefined) {
        throw new BadRequestException(
          `Criterion with id ${detail.criterionId} is not valid or not active.`,
        );
      }

      if (
        typeof detail.score !== 'number' ||
        !Number.isFinite(detail.score) ||
        detail.score < 0 ||
        detail.score > MAX_SCORE
      ) {
        throw new BadRequestException(
          `Score for criterion ${detail.criterionId} is out of range (0-5). Score: ${detail.score}`,
        );
      }

      if (!this.hasAtMostTwoDecimals(detail.score)) {
        throw new BadRequestException(
          `El puntaje del criterio ${detail.criterionId} admite como máximo 2 decimales. Puntaje: ${detail.score}`,
        );
      }

      totalScore += detail.score * weight;

      return {
        criterionId: detail.criterionId,
        score: detail.score,
        createdAt: now,
        updatedAt: now,
        isActive: detail.isActive ?? true,
      };
    });

    this.assertCompleteDetails(details, new Set(criteriaWeightMap.keys()));

    return {
      detailsData,
      totalScore: Math.min(MAX_SCORE, parseFloat(totalScore.toFixed(4))),
    };
  }

  /**
   * `Number.isInteger(score * 100)` no sirve: 4.35 * 100 = 434.99999999999994 en coma flotante.
   * Se compara contra el entero más cercano con una tolerancia muy por debajo de 0.001.
   */
  private hasAtMostTwoDecimals(score: number): boolean {
    const scaled = score * 100;
    return Math.abs(scaled - Math.round(scaled)) < 1e-6;
  }

  private criteriaWeightMap(criteria: { id: number; weight: number | null }[]) {
    const map = new Map<number, number>();
    criteria.forEach((criterion) => {
      map.set(criterion.id, criterion.weight ?? 0);
    });
    return map;
  }

  private async findActiveEdition() {
    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    if (!activeEdition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }
    return activeEdition;
  }

  private async findProfessorRoleId(): Promise<number | undefined> {
    const professorRole = await this.prisma.role.findUnique({
      where: { name: 'Profesor' },
      select: { id: true },
    });
    return professorRole?.id;
  }

  /** #13: isSenior lo decide el servidor con el rol y la categoría del usuario, nunca el body. */
  private async loadActor(jurorId: string) {
    const professorRoleId = await this.findProfessorRoleId();
    const jurorUser = await this.prisma.user.findUnique({
      where: { id: jurorId },
      select: { roleId: true, jurorCategory: true },
    });
    const actor: EvaluationActor = {
      id: jurorId,
      roleId: jurorUser?.roleId ?? -1,
      jurorCategory: jurorUser?.jurorCategory ?? null,
    };
    return {
      actor,
      professorRoleId,
      isSenior: this.isSeniorActor(actor, professorRoleId),
    };
  }

  // Profesor o jurado SENIOR. Misma regla de nivel que validateEvaluatorCategoryForLevel
  // (juror-assignment.service.ts): allí es privada y lanza otro mensaje, por eso no se reutiliza.
  private isSeniorActor(actor: EvaluationActor, professorRoleId?: number) {
    return (
      (professorRoleId !== undefined && actor.roleId === professorRoleId) ||
      actor.jurorCategory === JurorCategory.SENIOR
    );
  }

  private contentHash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private replayRequest(prior: { contentHash: string; response: any }, hash: string) {
    if (prior.contentHash !== hash) throw new ConflictException('Idempotency-Key ya fue usada con contenido distinto.');
    return prior.response;
  }
}
