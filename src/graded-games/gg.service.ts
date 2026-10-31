import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { BlobReferenceService } from '../upload/blob-reference.service';


@Injectable()
export class GradedGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobRefs: BlobReferenceService,
  ) {}
  private async checkEvaluationsOpen() {
    const config = await this.prisma.eventConfiguration.findFirst();
    if (!config?.evaluationsOpen) {
      throw new ForbiddenException('Las evaluaciones no están habilitadas en este momento.');
    }
  }

  // Búsqueda flexible de juegos calificados
  async searchGradedGames(jurorId: string, search: string) {
    await this.checkEvaluationsOpen();
    const normalizedSearch = search.trim();
    const isNumeric = /^\d+$/.test(normalizedSearch);
    const numericSearch = isNumeric ? parseInt(normalizedSearch, 10) : null;

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

    // Filtros de búsqueda
    const searchConditions: Prisma.VideogameWhereInput['OR'] = [
      { name: { contains: normalizedSearch, mode: 'insensitive' } },
      { team: { teamName: { contains: normalizedSearch, mode: 'insensitive' } } },
      { team: { members: { some: {
        OR: [
          { firstName: { contains: normalizedSearch, mode: 'insensitive' } },
          { lastName: { contains: normalizedSearch, mode: 'insensitive' } }
        ]
      }}}},
      { team: { members: { some: { nrcs: { some: { subject: { name: { contains: normalizedSearch, mode: 'insensitive' } } } } } } } }
    ];

    if (numericSearch !== null) {
      searchConditions.push(
        { team: { members: { some: { nrcs: { some: { code: numericSearch } } } } } }
      );
    }

    const videogames = await this.prisma.videogame.findMany({
      where: {
        id: { in: evaluatedIds },
        OR: searchConditions,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        description: true,
        team: {
          select: {
            teamName: true,
            teamCode: true,
            members: {
              select: {
                firstName: true,
                lastName: true,
                nrcs: {
                  select: {
                    code: true,
                    subject: { select: { name: true } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
      take: 100,
    });

    await this.blobRefs.resolveInPlace(videogames as any[]);
    const data = videogames.map((videogame) => {
      const nrcCodes = new Set<number>();
      let firstSubject = 'Sin materia';

      videogame.team?.members?.forEach(member => {
        member.nrcs?.forEach(nrc => {
          nrcCodes.add(nrc.code);
          if (firstSubject === 'Sin materia' && nrc.subject?.name) {
            firstSubject = nrc.subject.name;
          }
        });
      });

      return {
        videogameId: videogame.id,
        videogameName: videogame.name,
        logoUrl: videogame.logoUrl ?? undefined,
        description: videogame.description || 'Sin descripción',
        teamName: videogame.team?.teamName || 'Sin equipo',
        teamCode: videogame.team?.teamCode,
        members: videogame.team?.members?.map(member => ({
          fullName: `${member.firstName} ${member.lastName}`,
        })) || [],
        nrc: Array.from(nrcCodes).join(', ') || 'Sin NRC',
        subject: firstSubject,
        totalScore: scoresMap.get(videogame.id) || 0,
        comments: commentsMap.get(videogame.id) || 'Sin comentarios',
        isEvaluated: true,
      };
    });

    return { data };
  }

  // Paginación de juegos calificados
  async getGradedVideogames(
    jurorId: string,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<VideogameResponseDto>> {
    await this.checkEvaluationsOpen();
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
              teamCode: true,
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

    await this.blobRefs.resolveInPlace(videogames as any[]);
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
        teamCode: videogame.team?.teamCode,
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

  // Conteo de juegos calificados
  async getGradedVideogamesCount(jurorId: string): Promise<number> {
    await this.checkEvaluationsOpen();
    const evaluations = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: { videogameId: true },
    });
    return evaluations.length;
  }

  // Búsqueda rápida (solo nombre y equipo)
  async quickSearchGradedGames(jurorId: string, search: string) {
    await this.checkEvaluationsOpen();
    const normalizedSearch = search.trim();
    if (!normalizedSearch) {
      return { data: [] };
    }

    const evaluations = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: { videogameId: true },
    });
    const evaluatedIds = evaluations.map((e) => e.videogameId);

    const searchConditions: Prisma.VideogameWhereInput['OR'] = [
      { name: { contains: normalizedSearch, mode: 'insensitive' } },
      { team: { teamName: { contains: normalizedSearch, mode: 'insensitive' } } },
    ];

    const videogames = await this.prisma.videogame.findMany({
      where: {
        id: { in: evaluatedIds },
        OR: searchConditions,
      },
      select: {
        id: true,
        name: true,
        team: {
          select: {
            teamName: true,
          },
        },
      },
      take: 10,
    });

    const data = videogames.map(videogame => ({
      id: videogame.id,
      name: videogame.name,
      teamName: videogame.team?.teamName || 'Sin equipo',
    }));

    return { data };
  }
}