import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EditionStatus, JurorCategory, Prisma } from '@prisma/client';
import { CriterionService } from 'src/criterion/criterion.service';
import { PrismaService } from '../prisma/prisma.service';
import { BatchEvaluationDto } from './dto/batchEvaluation.dto';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly criterionService: CriterionService,
  ) {}

  private async checkEvaluationsOpen() {
    const config = await this.prisma.eventConfiguration.findFirst();

    if (!config?.evaluationsOpen) {
      throw new ForbiddenException(
        'Las evaluaciones no están habilitadas en este momento.',
      );
    }
  }

  private isDuplicateEvaluationError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private assertValidIdempotencyKey(key?: string) {
    if (key !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key inválida: use 8-128 caracteres alfanuméricos, guion o guion bajo.',
      );
    }
  }

  private async findExistingEvaluationId(jurorId: string, videogameId: number) {
    const existing = await this.prisma.evaluation.findUnique({
      where: { jurado_videojuego_unique: { jurorId, videogameId } },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  /**
   * Creates an evaluation and its details in a single query.
   * Responds 409 with the existing evaluationId if the juror already evaluated
   * the videogame, so a retried request does not end in a confusing 500.
   * @param jurorId string
   * @param evaluationPayload object with date, comments, videogameId, totalScore, details (array)
   */
  async createEvaluationWithDetails(
    jurorId: string,
    evaluationPayload: CreateEvaluationDto,
    idempotencyKey?: string,
  ) {
    this.assertValidIdempotencyKey(idempotencyKey);
    await this.checkEvaluationsOpen();

    const { date, comments, videogameId, details } = evaluationPayload;

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
      totalScore: calculatedTotalScore,
      details: {
        create: detailsData,
      },
    };

    let evaluation: { id: number };
    try {
      evaluation = await this.prisma.evaluation.create({
        data: createData,
        select: {
          id: true,
        },
      });
    } catch (error) {
      if (this.isDuplicateEvaluationError(error)) {
        const existingId = await this.findExistingEvaluationId(
          jurorId,
          videogameId,
        );
        // Reintento con la misma clave: se reproduce el resultado sin duplicar.
        if (idempotencyKey && existingId) {
          return {
            evaluationId: existingId,
            replayed: true,
            message: 'Evaluación ya registrada previamente',
          };
        }
        throw new ConflictException({
          statusCode: 409,
          code: 'EVALUATION_ALREADY_EXISTS',
          message:
            'Ya existe una evaluación de este jurado para el videojuego.',
          evaluationId: existingId,
        });
      }
      throw error;
    }

    return {
      evaluationId: evaluation.id,
      message: 'Evaluación y detalles guardados correctamente',
    };
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
    this.assertValidIdempotencyKey(idempotencyKey);
    await this.checkEvaluationsOpen();

    const results = {
      successful: [] as {
        videogameId: number;
        evaluationId: number;
        replayed?: boolean;
      }[],
      failed: [] as {
        videogameId: number;
        error: string;
        evaluationId?: number | null;
      }[],
    };

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

    for (const evaluationPayload of batchPayload.evaluations) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
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

          const evaluation = await tx.evaluation.create({
            data: {
              jurorId,
              date: new Date(evaluationPayload.date),
              comments: evaluationPayload.comments,
              videogameId: evaluationPayload.videogameId,
              editionId: activeEdition.id,
              isSenior,
              totalScore: calculatedTotalScore,
              details: {
                create: detailsData,
              },
            },
            select: {
              id: true,
            },
          });

          return {
            videogameId: evaluationPayload.videogameId,
            evaluationId: evaluation.id,
          };
        });

        results.successful.push(result);
      } catch (error: any) {
        if (this.isDuplicateEvaluationError(error)) {
          const existingId = await this.findExistingEvaluationId(
            jurorId,
            evaluationPayload.videogameId,
          );
          // Reintento con la misma clave: la fila cuenta como ya registrada.
          if (idempotencyKey && existingId) {
            results.successful.push({
              videogameId: evaluationPayload.videogameId,
              evaluationId: existingId,
              replayed: true,
            });
            continue;
          }
          results.failed.push({
            videogameId: evaluationPayload.videogameId,
            error: 'EVALUATION_ALREADY_EXISTS',
            evaluationId: existingId,
          });
          continue;
        }
        results.failed.push({
          videogameId: evaluationPayload.videogameId,
          error: error.message || 'Error desconocido al guardar la evaluación',
        });
      }
    }

    return {
      results,
      message: `Procesadas ${batchPayload.evaluations.length} evaluaciones: ${results.successful.length} exitosas, ${results.failed.length} fallidas`,
    };
  }
}
