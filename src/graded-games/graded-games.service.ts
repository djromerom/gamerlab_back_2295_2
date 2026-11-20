import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GradedCriterionScore,
  VideogameResponseDto,
} from './dto/videogame-response.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Prisma } from '@prisma/client';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { assertEvaluationsOpen } from '../settings/active-edition-config';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';
import { jurorEvaluationsOf } from '../evaluation/juror-evaluation';
import { GRADABLE_TEAM } from '../teams/team-status';
import {
  SEARCHABLE_MEMBER_SELECT,
  filterVideogamesBySearch,
  firstNrcOnly,
} from 'src/pending-games/videogame-search';

/**
 * ARK-132 (BG-19): el jurado solo ve lo que calificó en la edición activa (por el equipo del
 * juego), no sus calificaciones de ferias pasadas.
 * ARK-147 (BG-31): solo sus evaluaciones de jurado; la nota del profesor a sus NRC no cuenta.
 */
function gradedInActiveEdition(jurorId: string): Prisma.EvaluationWhereInput {
  return {
    ...jurorEvaluationsOf(jurorId),
    // HU-39 (ARK-209): lo que calificó de un equipo luego marcado no calificable deja de verse
    videogame: { team: { edition: ACTIVE_EDITION_WHERE, ...GRADABLE_TEAM } },
  };
}

/**
 * ARK-264 (BG-64): lo que se lee de cada evaluación del jurado, con su puntaje por criterio
 * para el detalle de «Calificados» / «Equipos Evaluados».
 */
const GRADED_EVALUATION_SELECT = {
  videogameId: true,
  totalScore: true,
  comments: true,
  details: {
    where: { isActive: true },
    orderBy: { criterionId: 'asc' },
    select: {
      criterionId: true,
      score: true,
      criterion: { select: { name: true } },
    },
  },
} satisfies Prisma.EvaluationSelect;

type GradedEvaluation = Prisma.EvaluationGetPayload<{
  select: typeof GRADED_EVALUATION_SELECT;
}>;

/** Puntaje por criterio de una evaluación, en el orden de los criterios. */
function criteriaOf(evaluation: GradedEvaluation): GradedCriterionScore[] {
  return evaluation.details.map((detail) => ({
    criterionId: detail.criterionId,
    name: detail.criterion.name,
    score: detail.score,
  }));
}


@Injectable()
export class GradedGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobRefs: BlobReferenceService,
  ) {}
  /** ARK-134: interruptor de la edición activa (nunca la fila de otra edición). */
  private checkEvaluationsOpen() {
    return assertEvaluationsOpen(this.prisma);
  }

  // Búsqueda flexible de juegos calificados
  async searchGradedGames(jurorId: string, search: string) {
    await this.checkEvaluationsOpen();

    // Obtener evaluaciones del jurado
    const evaluations = await this.prisma.evaluation.findMany({
      where: gradedInActiveEdition(jurorId),
      select: GRADED_EVALUATION_SELECT,
    });

    const evaluatedIds = evaluations.map((e) => e.videogameId);
    const scoresMap = new Map(evaluations.map((e) => [e.videogameId, e.totalScore]));
    const commentsMap = new Map(evaluations.map((e) => [e.videogameId, e.comments]));
    const criteriaMap = new Map(evaluations.map((e) => [e.videogameId, criteriaOf(e)]));

    // BG-60 (ARK-260): se traen los juegos que calificó y se filtran en memoria para ignorar
    // tildes y buscar también por código de equipo (ver videogame-search.ts).
    const candidates = await this.prisma.videogame.findMany({
      where: { id: { in: evaluatedIds } },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        description: true,
        team: {
          select: {
            teamName: true,
            teamCode: true,
            members: { select: SEARCHABLE_MEMBER_SELECT },
          },
        },
      },
    });
    const videogames = filterVideogamesBySearch(candidates, search).slice(0, 100);

    await this.blobRefs.resolveInPlace(videogames as any[]);
    const data = videogames.map((videogame) => {
      const nrcCodes = new Set<number>();
      let firstSubject = 'Sin materia';

      firstNrcOnly(videogame.team?.members).forEach(member => {
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
        criteria: criteriaMap.get(videogame.id) ?? [],
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
      where: gradedInActiveEdition(jurorId),
      select: GRADED_EVALUATION_SELECT,
    });

    const evaluatedIds = evaluations.map((e) => e.videogameId);
    const scoresMap = new Map(evaluations.map((e) => [e.videogameId, e.totalScore]));
    const commentsMap = new Map(evaluations.map((e) => [e.videogameId, e.comments]));
    const criteriaMap = new Map(evaluations.map((e) => [e.videogameId, criteriaOf(e)]));

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
        criteria: criteriaMap.get(videogame.id) ?? [],
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
      where: gradedInActiveEdition(jurorId),
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
      where: gradedInActiveEdition(jurorId),
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