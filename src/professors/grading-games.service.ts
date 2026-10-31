import { Injectable, NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginatedResult } from '../common/types/paginated-result.type';
import {
  GradingGamesQueryDto,
  resolvePanelSearch,
} from './dto/grading-games-query.dto';
import {
  matchesSearch,
  PanelNrcGroup,
  PanelTeam,
  ProfessorPanelQueryService,
  seesAllProfessors,
  sortPanelTeams,
} from './professor-panel-query.service';

/** Fila de `GET /professors/grading-games` (mismo formato que antes de HU-03). */
export interface GradingGameRow {
  source: 'current' | 'historical';
  teamCode: string;
  /** Códigos de NRC separados por coma, o null. */
  nrc: string | null;
  team: string;
  /** Nombres de los integrantes activos separados por coma. */
  integrantes: string;
  videogame: string | null;
  videogameId: number | null;
  editionId: number;
  /** Id del NRC si el equipo está en uno solo; si no, null. */
  nrcId: number | null;
  calificacionFeria: number | null;
  calificacionDocente: number | null;
  canEdit: boolean;
}

interface ListedTeam {
  team: PanelTeam;
  editionId: number;
  nrcs: { id: number; code: number; professorId: string }[];
}

/**
 * Listado del panel de calificaciones del profesor (HU-03).
 *
 * Los equipos de la feria activa salen de `ProfessorPanelQueryService`, la misma
 * consulta de la exportación (HU-02): mismas ferias, NRC, `isActive`, búsqueda y
 * orden. Aquí solo se une cada equipo en una fila (aunque esté en varios NRC),
 * se pagina y se agregan las notas.
 *
 * Con `includeHistorical=true` se agrega al final la vista histórica global de
 * solo lectura (decisión del 2026-10-29: equipos archivados de cualquier
 * profesor; solo nombres, metadatos del equipo y nota final de feria).
 */
@Injectable()
export class GradingGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelQuery: ProfessorPanelQueryService,
  ) {}

  async list(
    professorId: string,
    query: GradingGamesQueryDto,
    roleId?: number,
  ): Promise<PaginatedResult<GradingGameRow>> {
    const { page, limit, editionId, nrcId, sortBy, sortOrder } = query;
    const filters = {
      editionId,
      nrcId,
      search: resolvePanelSearch(query),
      sortBy,
      sortOrder,
    };

    const groups = await this.panelQuery
      .findPanelGroups(professorId, filters, roleId)
      .catch((err: unknown) => {
        // El NRC puede ser de una feria archivada: solo tiene filas históricas
        if (query.includeHistorical && err instanceof NotFoundException) {
          return [] as PanelNrcGroup[];
        }
        throw err;
      });

    const current = this.mergeTeams(groups);
    const sorted = sortPanelTeams(
      [...current.keys()].map((id) => current.get(id)!.team),
      sortBy,
      sortOrder,
    ).map((t) => current.get(t.teamId)!);

    const historical = query.includeHistorical
      ? await this.findHistoricalRows(filters)
      : [];

    const totalItems = sorted.length + historical.length;
    const start = (page - 1) * limit;
    const pageCurrent = sorted.slice(start, start + limit);
    const pageHistorical = historical.slice(
      Math.max(0, start - sorted.length),
      Math.max(0, start + limit - sorted.length),
    );

    const data = [
      ...(await this.toCurrentRows(pageCurrent, professorId, roleId)),
      ...pageHistorical,
    ];
    return {
      data,
      metadata: {
        totalItems,
        itemsOnCurrentPage: data.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /** Una entrada por equipo, con todos sus NRC del alcance consultado. */
  private mergeTeams(groups: PanelNrcGroup[]): Map<number, ListedTeam> {
    const teams = new Map<number, ListedTeam>();
    for (const group of groups) {
      for (const team of group.teams) {
        const entry = teams.get(team.teamId) ?? {
          team,
          editionId: group.edition.id,
          nrcs: [],
        };
        entry.nrcs.push({
          id: group.nrcId,
          code: group.nrcCode,
          professorId: group.professorId,
        });
        teams.set(team.teamId, entry);
      }
    }
    return teams;
  }

  /**
   * Notas: `calificacionFeria` es `finalScore` de la vista de notas finales
   * (lo mismo que `getFinalScoreByVideogameId`) y `calificacionDocente` la
   * evaluación activa con nota del profesor (misma regla que la exportación). Con el Administrador, la del dueño del NRC si
   * el equipo está en NRC de un solo profesor. Solo para la página pedida.
   */
  private async toCurrentRows(
    teams: ListedTeam[],
    professorId: string,
    roleId?: number,
  ): Promise<GradingGameRow[]> {
    if (teams.length === 0) return [];
    const allProfessors = seesAllProfessors(roleId);
    const videogameIds = teams
      .map((t) => t.team.videogameId)
      .filter((id): id is number => id !== null);
    const jurorFor = (t: ListedTeam): string | null => {
      if (!allProfessors) return professorId;
      const owners = new Set(t.nrcs.map((n) => n.professorId));
      return owners.size === 1 ? [...owners][0] : null;
    };
    const jurorIds = [
      ...new Set(teams.map(jurorFor).filter((id): id is string => id !== null)),
    ];

    const [activeEdition, finalScores, evaluations] = await Promise.all([
      this.prisma.edition.findFirst({
        where: { status: EditionStatus.ACTIVE },
        include: { eventConfiguration: true },
        orderBy: { id: 'desc' },
      }),
      videogameIds.length === 0
        ? []
        : this.prisma.teamFinalScore.findMany({
            where: { videogameId: { in: videogameIds } },
            select: { videogameId: true, finalScore: true },
          }),
      videogameIds.length === 0 || jurorIds.length === 0
        ? []
        : this.prisma.evaluation.findMany({
            where: {
              videogameId: { in: videogameIds },
              jurorId: allProfessors ? { in: jurorIds } : professorId,
              isActive: true,
            },
            select: { videogameId: true, jurorId: true, totalScore: true },
            orderBy: { id: 'asc' },
          }),
    ]);

    const feria = new Map<number, number>();
    for (const row of finalScores) {
      if (row.finalScore !== null) feria.set(row.videogameId, row.finalScore);
    }
    // Igual que la exportación: primera evaluación activa con nota
    const docente = new Map<string, number>();
    for (const ev of evaluations) {
      const key = `${ev.jurorId}:${ev.videogameId}`;
      if (ev.totalScore !== null && !docente.has(key)) {
        docente.set(key, ev.totalScore);
      }
    }
    const editable = Boolean(
      activeEdition?.eventConfiguration?.evaluationsOpen,
    );

    return teams.map((t) => {
      const vgId = t.team.videogameId;
      const juror = jurorFor(t);
      const ownsNrc = t.nrcs.some((n) => n.professorId === professorId);
      return {
        source: 'current' as const,
        teamCode: t.team.teamCode,
        nrc: t.nrcs.map((n) => n.code).join(', ') || null,
        team: t.team.teamName,
        integrantes: t.team.members.map((m) => m.fullName).join(', '),
        videogame: t.team.videogameName,
        videogameId: vgId,
        editionId: t.editionId,
        nrcId: t.nrcs.length === 1 ? t.nrcs[0].id : null,
        calificacionFeria: vgId === null ? null : (feria.get(vgId) ?? null),
        calificacionDocente:
          vgId === null || juror === null
            ? null
            : (docente.get(`${juror}:${vgId}`) ?? null),
        canEdit:
          vgId !== null &&
          editable &&
          activeEdition?.id === t.editionId &&
          ownsNrc,
      };
    });
  }

  /**
   * Vista histórica global de solo lectura (no filtra por profesor). La
   * identidad y el código del NRC vienen del snapshot copiado al archivar.
   * Misma búsqueda y orden que los equipos actuales.
   */
  private async findHistoricalRows(filters: {
    editionId?: number;
    nrcId?: number;
    search?: string;
    sortBy: GradingGamesQueryDto['sortBy'];
    sortOrder: GradingGamesQueryDto['sortOrder'];
  }): Promise<GradingGameRow[]> {
    const { editionId, nrcId, search, sortBy, sortOrder } = filters;
    const historical = await this.prisma.historicalTeam.findMany({
      where: {
        ...(editionId === undefined ? {} : { editionId }),
        ...(nrcId === undefined
          ? {}
          : { members: { some: { nrcs: { some: { nrcId } } } } }),
      },
      include: { members: { include: { nrcs: true } }, videogame: true },
      // Desempate estable para la paginación (el orden por nombre va después)
      orderBy: [{ editionId: 'desc' }, { id: 'asc' }],
    });

    const byId = new Map<number, (typeof historical)[number]>();
    const teams: PanelTeam[] = [];
    for (const t of historical) {
      if (!t.videogame) continue;
      byId.set(t.id, t);
      teams.push({
        teamId: t.id,
        teamCode: t.teamCode,
        teamName: t.teamName,
        videogameId: t.videogame.id,
        videogameName: t.videogame.name,
        members: t.members.map((m) => ({
          firstName: m.firstName,
          lastName: m.lastName,
          studentCode: m.studentCode,
          fullName: `${m.firstName} ${m.lastName}`.trim(),
        })),
      });
    }

    return sortPanelTeams(
      teams.filter((t) => matchesSearch(t, search)),
      sortBy,
      sortOrder,
    ).map((pt) => {
      const t = byId.get(pt.teamId)!;
      const nrcs = new Map<number, number>();
      for (const m of t.members) {
        for (const n of m.nrcs) nrcs.set(n.nrcId, n.code);
      }
      const matching = [...nrcs.entries()].filter(
        ([id]) => nrcId === undefined || id === nrcId,
      );
      return {
        source: 'historical' as const,
        teamCode: t.teamCode,
        nrc: matching.map(([, code]) => code).join(', ') || null,
        team: t.teamName,
        integrantes: t.members
          .map((m) => `${m.firstName} ${m.lastName}`)
          .join(', '),
        videogame: t.videogame!.name,
        videogameId: t.videogame!.id,
        editionId: t.editionId,
        nrcId: matching.length === 1 ? matching[0][0] : null,
        calificacionFeria: t.videogame!.finalScore,
        calificacionDocente: null,
        canEdit: false,
      };
    });
  }
}
