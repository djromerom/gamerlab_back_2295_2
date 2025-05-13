// src/graded-games/gg.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Injectable()
export class GradedGamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getGradedVideogames(
    jurorId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: VideogameResponseDto[]; metadata: any }> {
    const offset = (page - 1) * limit;

    const evaluatedIds = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: { videogameId: true },
    }).then((evaluations) => evaluations.map((e) => e.videogameId));

    const [videogames, totalItems] = await this.prisma.$transaction([
      this.prisma.videogame.findMany({
        skip: offset,
        take: limit,
        where: { id: { in: evaluatedIds } },
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
                      subject: {
                        select: { name: true },
                      },
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
          videogame.team?.members
            ?.flatMap((member) => member.nrcs?.map((nrc) => nrc.code) || [])
        )
      );

      return {
        videogameId: videogame.id,
        videogameName: videogame.name,
        logoUrl: videogame.logoUrl,
        description: videogame.description || 'Sin descripción',
        teamName: videogame.team?.teamName || 'Sin equipo',
        members: videogame.team?.members?.map((member) => ({
          fullName: `${member.firstName} ${member.lastName}`,
        })) || [],
        nrc: uniqueNrcs.join(', ') || 'Sin NRC',
        subject: videogame.team?.members?.[0]?.nrcs?.[0]?.subject?.name || 'Sin materia',
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
