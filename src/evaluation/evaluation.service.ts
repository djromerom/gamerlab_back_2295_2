import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';


@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

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
  async createEvaluationWithDetails(jurorId: string, evaluationPayload: any) {
    await this.checkEvaluationsOpen();
    const { date, comments, videogameId, totalScore, details } = evaluationPayload;

    // Mapea los detalles para la relación
    const detailsData = details.map((detail: any) => ({
      criterionId: detail.criterionId,
      score: detail.score,
      createdAt: new Date(detail.createdAt),
      updatedAt: new Date(detail.updatedAt),
      isActive: detail.isActive ?? true,
    }));

    // Crea la evaluación y los detalles en una sola consulta
    const evaluation = await this.prisma.evaluation.create({
      data: {
        jurorId,
        date: new Date(date),
        comments,
        videogameId,
        totalScore,
        editionId: 1,
        details: {
          create: detailsData,
        },
      },
      select: {
        id: true,
      },
    });

    return { evaluationId: evaluation.id, message: 'Evaluación y detalles guardados correctamente' };
  }
}