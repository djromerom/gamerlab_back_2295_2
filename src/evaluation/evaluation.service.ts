import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { CriterionService } from 'src/criterion/criterion.service';


@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService,
     private readonly criterionService: CriterionService
  ) { }

  private async checkEvaluationsOpen() {
    const config = await this.prisma.eventConfiguration.findFirst();
    if (!config?.evaluationsOpen) {
      throw new ForbiddenException('Las evaluaciones no están habilitadas en este momento.');
    }
  }
  /**
   * Crea una evaluación y sus detalles en una sola consulta.
   * @param jurorId string
   * @param evaluationPayload objeto con date, comments, videogameId, totalScore, details (array)
   */
  async createEvaluationWithDetails(jurorId: string, evaluationPayload: CreateEvaluationDto) {
    await this.checkEvaluationsOpen();
    const { date, comments, videogameId, details } = evaluationPayload;
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
    activeCriteria.forEach(criterion => {
      criteriaWeightMap.set(criterion.id, criterion.weight ?? 0);
    });

    let calculatedTotalScore = 0;

    const detailsData = details.map(detail => {
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

    // Build create data as `any` to avoid TypeScript errors if Prisma client
    // types haven't been regenerated after the schema change.
    const createData: any = {
      jurorId,
      date: new Date(date),
      comments,
      videogameId,
      // mark whether this evaluation is from a senior juror (professor)
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

    return { evaluationId: evaluation.id, message: 'Evaluación y detalles guardados correctamente' };
  }
}
