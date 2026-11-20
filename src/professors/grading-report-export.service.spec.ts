import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';
import { ExcelExportOptions, ExcelExportService } from './excel-export.service';
import {
  buildGradingReportFileName,
  GradingReportExportService,
  NO_DATA_TO_EXPORT_MESSAGE,
} from './grading-report-export.service';
import {
  PanelNrcGroup,
  ProfessorPanelQueryService,
} from './professor-panel-query.service';

const edition = { id: 3, title: 'Feria 2026-2', year: 2026, semester: 30 };

const group = (
  nrcCode: number,
  teamIds: number[],
  ed = edition,
): PanelNrcGroup => ({
  nrcId: nrcCode,
  nrcCode,
  professorId: 'prof-1',
  subjectName: 'Programación Orientada a Objetos',
  edition: ed,
  teams: teamIds.map((id) => ({
    teamId: id,
    teamCode: `T-${id}`,
    teamName: `Equipo ${id}`,
    videogameId: id === 99 ? null : id * 100,
    videogameName: id === 99 ? null : `Juego ${id}`,
    members: [
      {
        firstName: 'José',
        lastName: 'Núñez',
        studentCode: `${id}`,
        fullName: 'José Núñez',
      },
    ],
  })),
});

const query = (overrides: Partial<GradingReportQueryDto> = {}) =>
  ({
    sortBy: 'team',
    sortOrder: 'asc',
    final: false,
    ...overrides,
  }) as GradingReportQueryDto;

describe('buildGradingReportFileName', () => {
  const date = new Date('2026-11-26T12:00:00Z');

  it('con feria y NRC los incluye en el nombre', () => {
    expect(
      buildGradingReportFileName([group(2501, [1])], { nrcId: 2501 }, date),
    ).toBe('calificaciones_2026-2_nrc-2501_2026-11-26.xlsx');
  });

  it('solo feria', () => {
    expect(
      buildGradingReportFileName(
        [group(2501, [1]), group(2502, [2])],
        { editionId: 3 },
        date,
      ),
    ).toBe('calificaciones_2026-2_todos-los-nrc_2026-11-26.xlsx');
  });

  it.each([
    [10, '2026-1'],
    [20, '2026-intersemestral'],
    [30, '2026-2'],
  ])(
    'BG-63: semestre %i ⇒ %s en el nombre (nunca el código crudo)',
    (semester, feria) => {
      const name = buildGradingReportFileName(
        [group(2501, [1], { ...edition, semester })],
        { editionId: 3 },
        date,
      );
      expect(name).toBe(
        `calificaciones_${feria}_todos-los-nrc_2026-11-26.xlsx`,
      );
      expect(name).not.toMatch(/2026-(10|20|30)|S\d0/);
    },
  );

  it('sin filtros', () => {
    expect(buildGradingReportFileName([group(2501, [1])], {}, date)).toBe(
      'calificaciones_todas-las-ferias_todos-los-nrc_2026-11-26.xlsx',
    );
  });
});

describe('ExcelExportService.buildContentDisposition', () => {
  it('conserva tildes en filename* y deja un respaldo ASCII', () => {
    expect(
      ExcelExportService.buildContentDisposition('calificación_ñandú.xlsx'),
    ).toBe(
      `attachment; filename="calificacion_nandu.xlsx"; filename*=UTF-8''calificaci%C3%B3n_%C3%B1and%C3%BA.xlsx`,
    );
  });
});

describe('GradingReportExportService', () => {
  let service: GradingReportExportService;
  const prisma = {
    teamFinalScore: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
  };
  const panelQuery = { findPanelGroups: jest.fn() };
  const excelExport = {
    generateAndStream: jest.fn<Promise<void>, [ExcelExportOptions, Response]>(),
  };
  const res = {} as Response;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.teamFinalScore.findMany.mockResolvedValue([]);
    prisma.evaluation.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradingReportExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProfessorPanelQueryService, useValue: panelQuery },
        { provide: ExcelExportService, useValue: excelExport },
      ],
    }).compile();
    service = module.get(GradingReportExportService);
  });

  it('sin resultados ⇒ 404 "No hay datos para exportar" y no genera archivo', async () => {
    panelQuery.findPanelGroups.mockResolvedValue([group(2501, [])]);

    await expect(
      service.exportFiltered('prof-1', query({ search: 'nadie' }), res),
    ).rejects.toThrow(new NotFoundException(NO_DATA_TO_EXPORT_MESSAGE));
    expect(excelExport.generateAndStream).not.toHaveBeenCalled();
  });

  it('pasa los filtros a la consulta común y respeta el orden recibido', async () => {
    panelQuery.findPanelGroups.mockResolvedValue([
      group(2501, [3, 1, 2]),
      group(2502, []), // sin resultados: no genera hoja
    ]);
    const q = query({ editionId: 3, search: 'equipo', sortBy: 'student' });

    await service.exportFiltered('prof-1', q, res);

    expect(panelQuery.findPanelGroups).toHaveBeenCalledWith(
      'prof-1',
      q,
      undefined,
    );
    const [options] = excelExport.generateAndStream.mock.calls[0];
    expect(options.sheets).toHaveLength(1);
    const sheet = options.sheets[0];
    expect(sheet.nrcCode).toBe('2501');
    expect(sheet.editionLabel).toBe('Feria 2026-2 (2026 - 2)');
    expect([...sheet.groups.values()].map((g) => g.teamName)).toEqual([
      'Equipo 3',
      'Equipo 1',
      'Equipo 2',
    ]);
    expect(options.fileName).toMatch(
      /^calificaciones_2026-2_todos-los-nrc_\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  it('BG-63: lleva la marca de rechazado y la feria intersemestral legible', async () => {
    const g = group(2501, [1, 2], { ...edition, semester: 20 });
    g.teams[1].rejected = true;
    panelQuery.findPanelGroups.mockResolvedValue([g]);

    await service.exportFiltered('prof-1', query({ editionId: 3 }), res);

    const [options] = excelExport.generateAndStream.mock.calls[0];
    expect(options.sheets[0].editionLabel).toBe(
      'Feria 2026-2 (2026 - Intersemestral)',
    );
    expect(
      [...options.sheets[0].groups.values()].map((r) => r.rejected),
    ).toEqual([false, true]);
    expect(options.fileName).toMatch(/^calificaciones_2026-intersemestral_/);
  });

  it('precarga las notas en una sola consulta por tipo', async () => {
    panelQuery.findPanelGroups.mockResolvedValue([group(2501, [1, 2, 99])]);
    prisma.teamFinalScore.findMany.mockResolvedValue([
      { videogameId: 100, finalScore: 4.25, avgJunior: 3.5 },
    ]);
    prisma.evaluation.findMany.mockResolvedValue([
      { videogameId: 100, jurorId: 'prof-1', totalScore: 4.8 },
      { videogameId: 100, jurorId: 'prof-1', totalScore: 1 },
    ]);

    await service.exportFiltered('prof-1', query({ final: true }), res);

    expect(prisma.evaluation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          videogameId: { in: [100, 200] },
          jurorId: 'prof-1',
          isActive: true,
        },
      }),
    );
    const [options] = excelExport.generateAndStream.mock.calls[0];
    expect(options.final).toBe(true);
    await expect(options.getFeriaScore(100)).resolves.toBe(4.25);
    await expect(options.getJuniorScore(100)).resolves.toBe(3.5);
    await expect(options.getDocenteScore(100, 'prof-1')).resolves.toBe(4.8);
    await expect(options.getDocenteScore(200, 'prof-1')).resolves.toBeNull();
  });
});
