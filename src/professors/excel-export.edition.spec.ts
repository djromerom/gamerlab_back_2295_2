import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';
import { ExcelExportService } from './excel-export.service';
import { GradingReportExportService } from './grading-report-export.service';
import {
  PanelNrcGroup,
  ProfessorPanelQueryService,
} from './professor-panel-query.service';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * BG-63 (ARK-263): el Excel de calificaciones del profesor muestra el semestre
 * legible («2026 - 2», «2026 - Intersemestral») en el nombre del archivo, el
 * encabezado de la hoja y la columna «Feria», y marca los equipos rechazados.
 */
describe('ExcelExportService: feria legible y rechazados (BG-63)', () => {
  const groupOf = (semester: number): PanelNrcGroup => ({
    nrcId: 1,
    nrcCode: 2501,
    professorId: 'prof-1',
    subjectName: 'Algoritmia',
    edition: { id: 3, title: 'Feria Gamer', year: 2026, semester },
    teams: [
      {
        teamId: 1,
        teamCode: 'N1-A',
        teamName: 'Activo',
        videogameId: 100,
        videogameName: 'Juego A',
        members: [],
      },
      {
        teamId: 2,
        teamCode: 'N1-R',
        teamName: 'Caído',
        videogameId: 200,
        videogameName: 'Juego R',
        members: [],
        rejected: true,
      },
    ],
  });

  const run = async (semester: number) => {
    const stream = new PassThrough();
    const setHeader = jest.fn();
    const res = Object.assign(stream, { setHeader }) as unknown as Response;
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));

    const prisma = {
      teamFinalScore: { findMany: jest.fn().mockResolvedValue([]) },
      evaluation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const panelQuery = {
      findPanelGroups: jest.fn().mockResolvedValue([groupOf(semester)]),
    };
    const exporter = new GradingReportExportService(
      prisma as unknown as PrismaService,
      panelQuery as unknown as ProfessorPanelQueryService,
      new ExcelExportService(),
    );
    await exporter.exportFiltered(
      'prof-1',
      {
        editionId: 3,
        final: true,
        sortBy: 'team',
        sortOrder: 'asc',
      } as GradingReportQueryDto,
      res,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks) as any);
    const rows: string[][] = [];
    workbook.worksheets[0].eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1).map((v) => String(v ?? '')));
    });
    const disposition = setHeader.mock.calls.find(
      ([name]) => name === 'Content-Disposition',
    )?.[1] as string;
    const header = rows.findIndex((r) => r.includes('Feria'));
    const column = (name: string) =>
      rows
        .slice(header + 1, header + 3)
        .map((r) => r[rows[header].indexOf(name)]);
    return { rows, title: rows[0][0], disposition, column };
  };

  it.each([
    [30, '2026 - 2', '2026-2'],
    [10, '2026 - 1', '2026-1'],
    [20, '2026 - Intersemestral', '2026-intersemestral'],
  ])(
    'semestre %i: «%s» en encabezado y columna, «%s» en el archivo',
    async (semester, label, slug) => {
      const { rows, title, disposition, column } = await run(semester);

      expect(title).toBe(`Algoritmia  ·  NRC 2501  ·  Feria Gamer (${label})`);
      expect(column('Feria')).toEqual([
        `Feria Gamer (${label})`,
        `Feria Gamer (${label})`,
      ]);
      expect(disposition).toContain(
        `filename="calificaciones_${slug}_todos-los-nrc_`,
      );

      const everything = [disposition, ...rows.flat()].join('\n');
      expect(everything).not.toMatch(/2026-(10|20|30)\b/);
      expect(everything).not.toMatch(/\bS(10|20|30)\b/);
    },
  );

  it('marca el equipo rechazado en la columna Equipo', async () => {
    const { column } = await run(30);
    expect(column('Equipo')).toEqual(['Activo', 'Caído (rechazado)']);
  });
});
