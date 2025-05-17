import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvaluation(jurorId: string, evaluationPayload: any) {
    const { date, comments, videogameId, totalScore } = evaluationPayload;
    
    const evaluation = await this.prisma.evaluation.create({
      data: {
        jurorId,
        date: new Date(date),
        comments: comments,
        videogameId: videogameId,
        totalScore: totalScore,
        editionId: 1,
      },
    });

    return { evaluationId: evaluation.id }; // Devuelve el ID de la evaluación creada
  }

  async createEvaluationDetails(details: any[]) {
    const dataDetails = details.map((detail) => ({
      evaluationId: detail.evaluationId,
      criterionId: detail.criterionId,
      score: detail.score,
      createdAt: new Date(detail.createdAt),
      updatedAt: new Date(detail.updatedAt),
      isActive: detail.isActive ?? true, // Asegura que isActive sea true si no se envía
    }));

    await this.prisma.evaluationDetail.createMany({
      data: dataDetails,
    });

    return { message: 'Detalles de evaluación guardados correctamente' };
  }
}