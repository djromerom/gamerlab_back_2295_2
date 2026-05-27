import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { CriterionService } from 'src/criterion/criterion.service';
import { EditionStatus } from '@prisma/client';

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

  /**
   * Creates an evaluation and its details in a single query.
   * @param jurorId string
   * @param evaluationPayload object with date, comments, videogameId, totalScore, details (array)
   */
  async createEvaluationWithDetails(
    jurorId: string,
    evaluationPayload: CreateEvaluationDto,
  ) {
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

    // Determine if the juror is a professor (roleId === 3) -> mark as senior
    // We fetch only the roleId for the juror user to avoid extra data.
    const jurorUser = await this.prisma.user.findUnique({
      where: { id: jurorId },
      select: { roleId: true },
    });

    const isSenior = jurorUser?.roleId === 3;

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

      if (detail.score < 1 || detail.score > 5) {
        throw new BadRequestException(
          `Score for criterion ${detail.criterionId} is out of range (1-5). Score: ${detail.score}`,
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

    const evaluation = await this.prisma.evaluation.create({
      data: createData,
      select: {
        id: true,
      },
    });

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
}