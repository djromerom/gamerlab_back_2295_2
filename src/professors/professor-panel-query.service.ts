import { Injectable, NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { ROLE_IDS } from 'src/auth/constants/roles';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PanelSortField,
  PanelSortOrder,
  ProfessorPanelQueryDto,
} from './dto/professor-panel-query.dto';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';

export interface PanelEdition {
  id: number;
  title: string;
  year: number;
  semester: number;
}

export interface PanelMember {
  firstName: string;
  lastName: string;
  studentCode: string;
  fullName: string;
}

export interface PanelTeam {
  teamId: number;
  teamCode: string;
  teamName: string;
  videogameId: number | null;
  videogameName: string | null;
  members: PanelMember[];
}

export interface PanelNrcGroup {
  nrcId: number;
  nrcCode: number;
  /** Profesor dueño del NRC (con el Administrador puede ser otro). */
  professorId: string;
  subjectName: string;
  edition: PanelEdition;
  teams: PanelTeam[];
}

/**
 * M4: el Administrador ve y exporta todos los NRC activos de la feria activa;
 * cualquier otro rol, solo los suyos. Mismo criterio que el resto de servicios
 * (`roleId === ROLE_IDS.ADMIN`).
 */
export function seesAllProfessors(roleId?: number): boolean {
  return roleId === ROLE_IDS.ADMIN;
}

const collator = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
});

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Un equipo coincide si todas las palabras buscadas aparecen en su nombre/código,
 * o todas aparecen en el nombre/código de un mismo integrante.
 */
export function matchesSearch(team: PanelTeam, search?: string): boolean {
  if (!search) return true;
  const tokens = normalizeText(search).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const containsAll = (text: string) => {
    const normalized = normalizeText(text);
    return tokens.every((t) => normalized.includes(t));
  };

  if (containsAll(`${team.teamName} ${team.teamCode}`)) return true;
  return team.members.some((m) =>
    containsAll(`${m.fullName} ${m.studentCode}`),
  );
}

/**
 * Orden del listado (una fila por equipo). Los integrantes de cada equipo vienen
 * ordenados ascendente; al ordenar por estudiante se usa el primero (asc) o el
 * último (desc) como clave. Desempate: nombre y código del equipo.
 */
export function sortPanelTeams(
  teams: PanelTeam[],
  sortBy: PanelSortField = 'team',
  sortOrder: PanelSortOrder = 'asc',
): PanelTeam[] {
  const direction = sortOrder === 'desc' ? -1 : 1;
  const studentKey = (t: PanelTeam) => {
    if (t.members.length === 0) return '';
    const member =
      sortOrder === 'desc' ? t.members[t.members.length - 1] : t.members[0];
    return member.fullName;
  };

  return [...teams].sort((a, b) => {
    const primary =
      sortBy === 'student'
        ? collator.compare(studentKey(a), studentKey(b))
        : collator.compare(a.teamName, b.teamName);
    if (primary !== 0) return primary * direction;
    const byName = collator.compare(a.teamName, b.teamName);
    if (byName !== 0) return byName * direction;
    return collator.compare(a.teamCode, b.teamCode) * direction;
  });
}

/**
 * Consulta común del panel de profesores: NRC del profesor (filtrados por feria
 * y NRC) con sus equipos (filtrados por búsqueda y ordenados).
 * Solo la feria activa: las ferias archivadas o inactivas no se muestran ni se
 * exportan (decisión de producto, 2026-10-29). `editionId` sigue aceptándose,
 * pero otra feria no devuelve resultados.
 * La usan la exportación (HU-02) y el listado (HU-03, `GradingGamesService`).
 * Con `roleId` de Administrador no filtra por profesor (M4).
 */
@Injectable()
export class ProfessorPanelQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findPanelGroups(
    professorId: string,
    filters: ProfessorPanelQueryDto,
    roleId?: number,
  ): Promise<PanelNrcGroup[]> {
    const { editionId, nrcId, search, sortBy, sortOrder } = filters;

    const nrcs = await this.prisma.nRC.findMany({
      where: {
        ...(seesAllProfessors(roleId) ? {} : { professorId }),
        isActive: true,
        edition: ACTIVE_EDITION_WHERE,
        ...(editionId ? { editionId } : {}),
        ...(nrcId ? { id: nrcId } : {}),
      },
      select: {
        id: true,
        code: true,
        editionId: true,
        professorId: true,
        subject: { select: { name: true } },
        edition: {
          select: { id: true, title: true, year: true, semester: true },
        },
      },
      orderBy: [
        { edition: { year: 'desc' } },
        { edition: { semester: 'desc' } },
        { subject: { name: 'asc' } },
        { code: 'asc' },
      ],
    });

    if (nrcId && nrcs.length === 0) {
      throw new NotFoundException(
        'El NRC no existe o no pertenece al profesor en la feria activa.',
      );
    }
    if (nrcs.length === 0) return [];

    const nrcIds = nrcs.map((n) => n.id);
    const teams = await this.prisma.team.findMany({
      where: {
        isActive: true,
        members: {
          some: { isActive: true, nrcs: { some: { id: { in: nrcIds } } } },
        },
      },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        editionId: true,
        videogame: { select: { id: true, name: true, isActive: true } },
        members: {
          where: { isActive: true },
          select: {
            firstName: true,
            lastName: true,
            studentCode: true,
            nrcs: { where: { id: { in: nrcIds } }, select: { id: true } },
          },
        },
      },
    });

    return nrcs.map((nrc) => {
      const nrcTeams = teams
        .filter(
          (t) =>
            t.editionId === nrc.editionId &&
            t.members.some((m) => m.nrcs.some((n) => n.id === nrc.id)),
        )
        .map((t) => this.toPanelTeam(t))
        .filter((t) => matchesSearch(t, search));

      return {
        nrcId: nrc.id,
        nrcCode: nrc.code,
        professorId: nrc.professorId,
        subjectName: nrc.subject.name,
        edition: nrc.edition,
        teams: sortPanelTeams(nrcTeams, sortBy, sortOrder),
      };
    });
  }

  private toPanelTeam(team: {
    id: number;
    teamCode: string;
    teamName: string;
    videogame: { id: number; name: string; isActive: boolean } | null;
    members: { firstName: string; lastName: string; studentCode: string }[];
  }): PanelTeam {
    const members = team.members
      .map((m) => ({
        firstName: m.firstName,
        lastName: m.lastName,
        studentCode: m.studentCode,
        fullName: `${m.firstName} ${m.lastName}`.trim(),
      }))
      .sort((a, b) => collator.compare(a.fullName, b.fullName));

    const videogame = team.videogame?.isActive ? team.videogame : null;
    return {
      teamId: team.id,
      teamCode: team.teamCode,
      teamName: team.teamName,
      videogameId: videogame?.id ?? null,
      videogameName: videogame?.name ?? null,
      members,
    };
  }
}
