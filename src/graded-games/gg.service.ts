import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';

@Injectable()
export class GradedGamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getGradedVideogames(
    jurorId: string,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<VideogameResponseDto>> {
    // Obtener evaluaciones del jurado
    const evaluations = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: {
        videogameId: true,
        totalScore: true,
        comments: true,
      },
    });

    const evaluatedIds = evaluations.map((e) => e.videogameId);
    const scoresMap = new Map(evaluations.map((e) => [e.videogameId, e.totalScore]));
    const commentsMap = new Map(evaluations.map((e) => [e.videogameId, e.comments]));

    const offset = (page - 1) * limit;

    // Paginación y conteo total
    const [videogames, totalItems] = await this.prisma.$transaction([
      this.prisma.videogame.findMany({
        where: { id: { in: evaluatedIds } },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          logoUrl: true,
          description: true,
          team: {
            select: {
              teamName: true,
              members: {
                select: {
                  firstName: true,
                  lastName: true,
                  nrcs: {
                    select: {
                      code: true,
                      subject: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.videogame.count({ where: { id: { in: evaluatedIds } } }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    const data = videogames.map((videogame) => {
      const uniqueNrcs = Array.from(
        new Set(
          videogame.team?.members?.flatMap((member) => member.nrcs?.map((nrc) => nrc.code) || []),
        ),
      );
      return {
        videogameId: videogame.id,
        videogameName: videogame.name,
        logoUrl: videogame.logoUrl ?? undefined,
        description: videogame.description || 'Sin descripción',
        teamName: videogame.team?.teamName || 'Sin equipo',
        members: videogame.team?.members?.map((member) => ({
          fullName: `${member.firstName} ${member.lastName}`,
        })) || [],
        nrc: uniqueNrcs.join(', ') || 'Sin NRC',
        subject: videogame.team?.members?.[0]?.nrcs?.[0]?.subject?.name || 'Sin materia',
        totalScore: scoresMap.get(videogame.id) || 0,
        comments: commentsMap.get(videogame.id) || 'Sin comentarios',
        isEvaluated: true,
      };
    });

    return {
      data,
      metadata: {
        totalItems,
        itemsOnCurrentPage: data.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
      },
    };
  }
}