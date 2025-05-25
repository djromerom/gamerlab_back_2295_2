import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';

@Injectable()
export class VideogamesService {
  constructor(private readonly prisma: PrismaService) { }

  async getPendingVideogames(
    jurorId: string,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<VideogameResponseDto>> {
    const evaluatedIds = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: { videogameId: true },
    }).then((evaluations) => evaluations.map((e) => e.videogameId));

    const assignedTeamIds = await this.prisma.team.findMany({
      where: {
        assignedJurors: {
          some: { id: jurorId },
        },
      },
      select: { id: true },
    }).then((teams) => teams.map((team) => team.id));

    const whereClause = {
      id: { notIn: evaluatedIds },
      teamId: { in: assignedTeamIds },
    };

    const offset = (page - 1) * limit;

    const [videogames, totalItems] = await this.prisma.$transaction([
      this.prisma.videogame.findMany({
        where: whereClause,
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
      this.prisma.videogame.count({ where: whereClause }),
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
        isEvaluated: false,
      } ;
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