import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';
import {
  ExcelExportService,
  GroupRow,
  NrcSheetData,
} from './excel-export.service';
import {
  PanelEdition,
  PanelNrcGroup,
  ProfessorPanelQueryService,
  seesAllProfessors,
} from './professor-panel-query.service';
import {
  editionPeriodLabel,
  editionPeriodSlug,
} from '../editions/semester-label';

export const NO_DATA_TO_EXPORT_MESSAGE = 'No hay datos para exportar';

const docenteKey = (jurorId: string, videogameId: number) =>
  `${jurorId}:${videogameId}`;

/**
 * BG-63: etiqueta de feria del encabezado y la columna «Feria», con el semestre
 * legible: «Feria 2026-2 (2026 - 2)», nunca el código crudo «2026-30».
 */
export function editionLabelOf(edition: PanelEdition): string {
  return `${edition.title} (${editionPeriodLabel(edition)})`;
}

/**
 * Nombre del archivo con feria y NRC:
 * `calificaciones_<feria|todas-las-ferias>_<nrc|todos-los-nrc>_<fecha>.xlsx`.
 */
export function buildGradingReportFileName(
  groups: PanelNrcGroup[],
  filters: Pick<GradingReportQueryDto, 'editionId' | 'nrcId'>,
  date: Date = new Date(),
): string {
  const editions = new Map(groups.map((g) => [g.edition.id, g.edition]));
  const feria =
    (filters.editionId || filters.nrcId) && editions.size === 1
      ? editionPeriodSlug([...editions.values()][0])
      : 'todas-las-ferias';
  const nrc =
    filters.nrcId && groups.length === 1
      ? `nrc-${groups[0].nrcCode}`
      : 'todos-los-nrc';
  return `calificaciones_${feria}_${nrc}_${date.toISOString().slice(0, 10)}.xlsx`;
}

/**
 * Exportación del panel de profesores con los filtros activos (HU-02).
 * Una fila por equipo; una hoja por NRC con resultados.
 * El Administrador exporta todos los NRC activos de la feria activa (M4); la
 * nota docente de cada hoja es la del profesor dueño del NRC.
 */
@Injectable()
export class GradingReportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelQuery: ProfessorPanelQueryService,
    private readonly excelExport: ExcelExportService,
  ) {}

  async exportFiltered(
    professorId: string,
    query: GradingReportQueryDto,
    res: Response,
    roleId?: number,
  ): Promise<void> {
    const groups = (
      await this.panelQuery.findPanelGroups(professorId, query, roleId)
    ).filter((g) => g.teams.length > 0);

    if (groups.length === 0) {
      throw new NotFoundException(NO_DATA_TO_EXPORT_MESSAGE);
    }

    const scores = await this.loadScores(
      groups,
      seesAllProfessors(roleId) ? null : professorId,
    );

    await this.excelExport.generateAndStream(
      {
        final: query.final,
        professorId,
        fileName: buildGradingReportFileName(groups, query),
        sheets: this.toSheets(groups),
        getFeriaScore: (vgId) =>
          Promise.resolve(scores.feria.get(vgId) ?? null),
        getJuniorScore: (vgId) =>
          Promise.resolve(scores.junior.get(vgId) ?? null),
        getDocenteScore: (vgId, sheetProfessorId) =>
          Promise.resolve(
            scores.docente.get(docenteKey(sheetProfessorId, vgId)) ?? null,
          ),
        // Los equipos sin videojuego activo no tienen nota que resolver
        resolveVideogameId: () => Promise.resolve(null),
      },
      res,
    );
  }

  private toSheets(groups: PanelNrcGroup[]): NrcSheetData[] {
    const usedNames = new Set<string>();
    return groups.map((group) => {
      const prefix = ExcelExportService.buildSubjectPrefix(group.subjectName);
      const rows = new Map<number, GroupRow>();
      // El Map conserva el orden de inserción: es el orden de la pantalla
      for (const team of group.teams) {
        rows.set(team.teamId, {
          teamCode: team.teamCode,
          teamName: team.teamName,
          videogameName: team.videogameName ?? 'No videojuego',
          videogameId: team.videogameId,
          nrcCodes: new Set([String(group.nrcCode)]),
          members: new Set(team.members.map((m) => m.fullName)),
          grade: null,
          hasNRC: true,
          rejected: team.rejected === true,
        });
      }
      return {
        sheetName: ExcelExportService.buildSheetName(
          prefix,
          group.nrcCode,
          usedNames,
        ),
        subjectName: group.subjectName,
        nrcCode: String(group.nrcCode),
        professorId: group.professorId,
        editionLabel: editionLabelOf(group.edition),
        groups: rows,
      };
    });
  }

  /**
   * Precarga todas las notas en una consulta por tipo (evita N+1).
   * `professorId` null (Administrador): notas docentes de los dueños de los NRC.
   */
  private async loadScores(
    groups: PanelNrcGroup[],
    professorId: string | null,
  ) {
    const videogameIds = [
      ...new Set(
        groups.flatMap((g) =>
          g.teams
            .map((t) => t.videogameId)
            .filter((id): id is number => id !== null),
        ),
      ),
    ];

    const feria = new Map<number, number>();
    const junior = new Map<number, number>();
    const docente = new Map<string, number>();
    if (videogameIds.length === 0) return { feria, junior, docente };

    const [finalScores, evaluations] = await Promise.all([
      this.prisma.teamFinalScore.findMany({
        where: { videogameId: { in: videogameIds } },
        select: { videogameId: true, finalScore: true, avgJunior: true },
      }),
      this.prisma.evaluation.findMany({
        where: {
          videogameId: { in: videogameIds },
          jurorId: professorId ?? {
            in: [...new Set(groups.map((g) => g.professorId))],
          },
          isActive: true,
        },
        select: { videogameId: true, jurorId: true, totalScore: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    for (const row of finalScores) {
      if (row.finalScore !== null) feria.set(row.videogameId, row.finalScore);
      if (row.avgJunior !== null) junior.set(row.videogameId, row.avgJunior);
    }
    for (const ev of evaluations) {
      // Igual que antes: la primera evaluación del profesor para ese videojuego
      const key = docenteKey(ev.jurorId, ev.videogameId);
      if (ev.totalScore !== null && !docente.has(key)) {
        docente.set(key, ev.totalScore);
      }
    }
    return { feria, junior, docente };
  }
}
