import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EditionStatus, JurorCategory } from '@prisma/client';
import { CriterionService } from 'src/criterion/criterion.service';
import {
  TeamVerificationService,
  UNVERIFIED_TEAM_MESSAGE,
} from '../team-verification/team-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { BatchEvaluationDto } from './dto/batchEvaluation.dto';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { createHash } from 'crypto';
import { countProgress } from './evaluation-progress';

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly criterionService: CriterionService,
    private readonly teamVerification: TeamVerificationService,
  ) {}

  private async checkEvaluationsOpen() {
    const config = await this.prisma.eventConfiguration.findFirst();

    if (!config?.evaluationsOpen) {
      throw new ForbiddenException(
        'Las evaluaciones no están habilitadas en este momento.',
      );
    }
  }

  /**
   * Creates an evaluation and its details in a single query.
   * @param jurorId string
   * @param evaluationPayload object with date, comments, videogameId, totalScore, details (array)
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

    const { date, comments, videogameId, details } = evaluationPayload;

    // HU-19: el jurado debe haber digitado el código del grupo
    await this.teamVerification.assertVerified(jurorId, videogameId);

    const activeEdition = await this.prisma.edition.findFirst({
      where: {
        status: EditionStatus.ACTIVE,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (!activeEdition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }

    // Determine if the juror is a professor or has SENIOR category -> mark as senior
    const professorRole = await this.prisma.role.findUnique({
      where: { name: 'Profesor' },
      select: { id: true },
    });
    const professorRoleId = professorRole?.id;

    const jurorUser = await this.prisma.user.findUnique({
      where: { id: jurorId },
      select: { roleId: true, jurorCategory: true },
    });

    // [MODIFICADO]: Se agregó la validación de jurorCategory === JurorCategory.SENIOR para evaluar correctamente su peso.
    // [ANTES]: isSenior solo se marcaba true si roleId === 3 (código quemado de Profesor).
    const isSenior =
      jurorUser?.roleId === professorRoleId ||
      jurorUser?.jurorCategory === JurorCategory.SENIOR;

    const activeCriteria = await this.criterionService.findForSelect();

    if (!activeCriteria || activeCriteria.length === 0) {
      throw new BadRequestException('No active evaluation criteria found.');
    }

    const criteriaWeightMap = new Map<number, number>();

    activeCriteria.forEach((criterion) => {
      criteriaWeightMap.set(criterion.id, criterion.weight ?? 0);
    });

    let calculatedTotalScore = 0;

    const detailsData = details.map((detail) => {
      const weight = criteriaWeightMap.get(detail.criterionId);

      if (weight === undefined) {
        throw new BadRequestException(
          `Criterion with id ${detail.criterionId} is not valid or not active.`,
        );
      }

      if (detail.score < 0 || detail.score > 5) {
        throw new BadRequestException(
          `Score for criterion ${detail.criterionId} is out of range (0-5). Score: ${detail.score}`,
        );
      }

      calculatedTotalScore += detail.score * weight;

      return {
        criterionId: detail.criterionId,
        score: detail.score,
        createdAt: new Date(detail.createdAt),
        updatedAt: new Date(detail.updatedAt),
        isActive: detail.isActive ?? true,
      };
    });

    calculatedTotalScore = parseFloat(calculatedTotalScore.toFixed(4));

    const createData: any = {
      jurorId,
      date: new Date(date),
      comments,
      videogameId,
      editionId: activeEdition.id,
      isSenior,
      contentHash,
      idempotencyKey: idempotencyKey ?? null,
      totalScore: calculatedTotalScore,
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

  async computeFinalScoreForVideogame(videogameId: number, editionId?: number) {
    const weighting = editionId
      ? await this.prisma.weighting.findUnique({ where: { editionId } })
      : null;

    const seniorPct = weighting?.seniorPct ?? 60;
    const juniorPct = weighting?.juniorPct ?? 40;

    const seniorAgg = await this.prisma.evaluation.aggregate({
      _avg: { totalScore: true },
      where: { videogameId, isSenior: true, isActive: true },
    });

    const juniorAgg = await this.prisma.evaluation.aggregate({
      _avg: { totalScore: true },
      where: { videogameId, isSenior: false, isActive: true },
    });

    const seniorAvg = seniorAgg._avg.totalScore ?? null;
    const juniorAvg = juniorAgg._avg.totalScore ?? null;

    if (seniorAvg == null && juniorAvg == null) return null;

    if (seniorAvg == null) {
      return Number(juniorAvg!.toFixed(2));
    }

    if (juniorAvg == null) {
      return Number(seniorAvg!.toFixed(2));
    }

    const final = (seniorAvg * seniorPct + juniorAvg * juniorPct) / 100;

    return Number(final.toFixed(2));
  }
  // [MODIFICADO]: Optimización de rendimiento para calificaciones masivas
  // [ANTES]: Consultaba Edición, Rol de Jurado y Criterios repetidamente dentro del ciclo for por cada videojuego calificado
  // [APRENDIZAJE]: Minimizar accesos de lectura redundantes a base de datos extrayendo consultas estáticas fuera de bucles asíncronos
  async createBatchEvaluations(
    jurorId: string,
    batchPayload: BatchEvaluationDto,
    idempotencyKey?: string,
  ) {
    const contentHash = this.contentHash(batchPayload);
    await this.checkEvaluationsOpen();

    const results = {
      successful: [] as { videogameId: number; evaluationId: number }[],
      failed: [] as { videogameId: number; error: string }[],
    };

    // HU-19: grupos cuyo código el jurado aún no digitó (una sola consulta para todo el lote)
    const unverifiedVideogameIds =
      await this.teamVerification.findUnverifiedVideogameIds(
        jurorId,
        batchPayload.evaluations.map((e) => e.videogameId),
      );

    // --- OPTIMIZACIÓN: CONSULTAS DE LECTURA GLOBALES (FUERA DEL BUCLE) ---
    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    if (!activeEdition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }

    const professorRole = await this.prisma.role.findUnique({
      where: { name: 'Profesor' },
      select: { id: true },
    });

    const professorRoleId = professorRole?.id;

    const jurorUser = await this.prisma.user.findUnique({
      where: { id: jurorId },
      select: { roleId: true, jurorCategory: true },
    });

    // [MODIFICADO]: Se agregó la verificación de JurorCategory.SENIOR para calcular adecuadamente el promedio final.
    // [ANTES]: Solo los profesores eran considerados isSenior: true en las calificaciones en bloque.
    const isSenior =
      jurorUser?.roleId === professorRoleId ||
      jurorUser?.jurorCategory === JurorCategory.SENIOR;

    const activeCriteria = await this.prisma.criterion.findMany({
      where: { isActive: true },
    });

    if (!activeCriteria || activeCriteria.length === 0) {
      throw new BadRequestException('No active evaluation criteria found.');
    }

    const criteriaWeightMap = new Map<number, number>();
    activeCriteria.forEach((criterion) => {
      criteriaWeightMap.set(criterion.id, criterion.weight ?? 0);
    });
    // ---------------------------------------------------------------------

    const processBatch = async (tx: any) => {
      // A transaction-scoped advisory lock serializes requests using the same key,
      // including the first request that has not inserted its durable receipt yet.
      if (idempotencyKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${jurorId}), hashtext(${idempotencyKey}))`;
        const prior = await tx.evaluationIdempotency.findUnique({ where: { jurorId_key: { jurorId, key: idempotencyKey } } });
        if (prior) return this.replayRequest(prior, contentHash);
      }

      for (const evaluationPayload of batchPayload.evaluations) {
        // HU-19: una repetición idempotente ya respondió arriba; aquí se rechaza la fila sin verificar
        if (unverifiedVideogameIds.has(evaluationPayload.videogameId)) {
          results.failed.push({
            videogameId: evaluationPayload.videogameId,
            error: UNVERIFIED_TEAM_MESSAGE,
          });
          continue;
        }

        const rowHash = this.contentHash(evaluationPayload);
        try {
          let calculatedTotalScore = 0;

          const detailsData = evaluationPayload.details.map((detail) => {
            const weight = criteriaWeightMap.get(detail.criterionId);

            if (weight === undefined) {
              throw new Error(
                `Criterion with id ${detail.criterionId} is not valid or not active.`,
              );
            }

            if (detail.score < 0 || detail.score > 5) {
              throw new Error(
                `Score for criterion ${detail.criterionId} is out of range (0-5). Score: ${detail.score}`,
              );
            }

            calculatedTotalScore += detail.score * weight;

            return {
              criterionId: detail.criterionId,
              score: detail.score,
              createdAt: new Date(detail.createdAt),
              updatedAt: new Date(detail.updatedAt),
              isActive: detail.isActive ?? true,
            };
          });

          calculatedTotalScore = parseFloat(calculatedTotalScore.toFixed(4));

          const existing = await tx.evaluation.findUnique({
            where: { jurado_videojuego_unique: { jurorId, videogameId: evaluationPayload.videogameId } },
            select: { id: true, contentHash: true },
          });
          if (existing) {
            if (existing.contentHash !== rowHash) throw new ConflictException(`Ya existe una evaluación distinta para el videojuego ${evaluationPayload.videogameId}.`);
            results.successful.push({ videogameId: evaluationPayload.videogameId, evaluationId: existing.id });
            continue;
          }

          const evaluation = await tx.evaluation.create({
            data: {
              jurorId,
              date: new Date(evaluationPayload.date),
              comments: evaluationPayload.comments,
              videogameId: evaluationPayload.videogameId,
              editionId: activeEdition.id,
              isSenior,
              contentHash: this.contentHash(evaluationPayload),
              idempotencyKey: null,
              totalScore: calculatedTotalScore,
              details: {
                create: detailsData,
              },
            },
            select: {
              id: true,
            },
          });

          results.successful.push({
            videogameId: evaluationPayload.videogameId,
            evaluationId: evaluation.id,
          });
      } catch (error: any) {
        if (error instanceof ConflictException) throw error;
        results.failed.push({
          videogameId: evaluationPayload.videogameId,
          error: error.message || 'Error desconocido al guardar la evaluación',
        });
      }
      }

      const response = {
        results,
        message: `Procesadas ${batchPayload.evaluations.length} evaluaciones: ${results.successful.length} exitosas, ${results.failed.length} fallidas`,
      };
      if (idempotencyKey) await tx.evaluationIdempotency.create({ data: { jurorId, key: idempotencyKey, contentHash, response } });
      return response;
    };
    return this.prisma.$transaction(processBatch, { isolationLevel: 'Serializable' });
  }

  private contentHash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private replayRequest(prior: { contentHash: string; response: any }, hash: string) {
    if (prior.contentHash !== hash) throw new ConflictException('Idempotency-Key ya fue usada con contenido distinto.');
    return prior.response;
  }
}
