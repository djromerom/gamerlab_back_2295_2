import { EditionStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { ROLE_IDS } from 'src/auth/constants/roles';
import { GradingGamesQueryDto } from './dto/grading-games-query.dto';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';
import { ExcelExportOptions, ExcelExportService } from './excel-export.service';
import {
  fairGradeRuleOf,
  GradingGameRow,
  GradingGamesService,
} from './grading-games.service';
import { GradingReportExportService } from './grading-report-export.service';
import { ProfessorPanelQueryService } from './professor-panel-query.service';

/**
 * Prisma en memoria para las pruebas del panel de profesores. Implementa solo
 * los filtros que usan `ProfessorPanelQueryService`, `GradingGamesService` y
 * `GradingReportExportService`, respetando `where` (no solo afirmándolo), para
 * que las pruebas de paridad y de `isActive` ejecuten la consulta real.
 */

interface FakeEdition {
  id: number;
  title: string;
  year: number;
  semester: number;
  status: EditionStatus;
  evaluationsOpen: boolean;
}

interface FakeNrc {
  id: number;
  code: number;
  editionId: number;
  professorId: string;
  isActive: boolean;
  subjectName: string;
}

interface FakeMember {
  firstName: string;
  lastName: string;
  studentCode: string;
  isActive: boolean;
  nrcIds: number[];
}

interface FakeTeam {
  id: number;
  teamCode: string;
  teamName: string;
  editionId: number;
  isActive: boolean;
  videogame: { id: number; name: string; isActive: boolean } | null;
  members: FakeMember[];
}

interface FakeHistoricalTeam {
  id: number;
  teamCode: string;
  teamName: string;
  editionId: number;
  isExternal: boolean;
  videogame: { id: number; name: string; finalScore: number | null } | null;
  members: {
    firstName: string;
    lastName: string;
    studentCode: string;
    nrcs: { nrcId: number; code: number }[];
  }[];
}

interface FakePanelData {
  editions: FakeEdition[];
  nrcs: FakeNrc[];
  teams: FakeTeam[];
  finalScores: {
    videogameId: number;
    finalScore: number | null;
    avgJunior: number | null;
    isExternal?: boolean;
  }[];
  evaluations: {
    id: number;
    videogameId: number;
    jurorId: string;
    totalScore: number | null;
    isActive: boolean;
  }[];
  historicalTeams: FakeHistoricalTeam[];
}

type IdIn = { in: number[] };
type StringFilter = string | { in: string[] };

const matchesString = (value: string, filter?: StringFilter) =>
  filter === undefined ||
  (typeof filter === 'string' ? value === filter : filter.in.includes(value));

function createFakePanelPrisma(data: FakePanelData) {
  const editionById = (id: number) => data.editions.find((e) => e.id === id)!;

  return {
    nRC: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: {
            professorId?: string;
            isActive?: boolean;
            edition?: { status: EditionStatus };
            editionId?: number;
            id?: number;
          };
        }) => {
          const rows = data.nrcs
            .filter(
              (n) =>
                (where.professorId === undefined ||
                  n.professorId === where.professorId) &&
                (where.isActive === undefined ||
                  n.isActive === where.isActive) &&
                (where.edition === undefined ||
                  editionById(n.editionId).status === where.edition.status) &&
                (where.editionId === undefined ||
                  n.editionId === where.editionId) &&
                (where.id === undefined || n.id === where.id),
            )
            .sort(
              (a, b) =>
                a.subjectName.localeCompare(b.subjectName) || a.code - b.code,
            )
            .map((n) => {
              const e = editionById(n.editionId);
              return {
                id: n.id,
                code: n.code,
                editionId: n.editionId,
                professorId: n.professorId,
                subject: { name: n.subjectName },
                edition: {
                  id: e.id,
                  title: e.title,
                  year: e.year,
                  semester: e.semester,
                },
              };
            });
          return Promise.resolve(rows);
        },
      ),
    },
    team: {
      findMany: jest.fn(
        ({
          where,
          select,
        }: {
          where: {
            isActive?: boolean;
            members: {
              some: { isActive?: boolean; nrcs: { some: { id: IdIn } } };
            };
          };
          select: { members: { where?: { isActive?: boolean } } };
        }) => {
          const nrcIds = where.members.some.nrcs.some.id.in;
          const listedMember = (m: FakeMember) =>
            select.members.where?.isActive === undefined ||
            m.isActive === select.members.where.isActive;
          const memberOk = (m: FakeMember) =>
            (where.members.some.isActive === undefined ||
              m.isActive === where.members.some.isActive) &&
            m.nrcIds.some((id) => nrcIds.includes(id));
          const rows = data.teams
            .filter(
              (t) =>
                (where.isActive === undefined ||
                  t.isActive === where.isActive) &&
                t.members.some(memberOk),
            )
            .map((t) => ({
              id: t.id,
              teamCode: t.teamCode,
              teamName: t.teamName,
              editionId: t.editionId,
              videogame: t.videogame,
              members: t.members.filter(listedMember).map((m) => ({
                firstName: m.firstName,
                lastName: m.lastName,
                studentCode: m.studentCode,
                nrcs: m.nrcIds
                  .filter((id) => nrcIds.includes(id))
                  .map((id) => ({ id })),
              })),
            }));
          return Promise.resolve(rows);
        },
      ),
    },
    edition: {
      findFirst: jest.fn(({ where }: { where: { status: EditionStatus } }) => {
        const e = [...data.editions]
          .sort((a, b) => b.id - a.id)
          .find((ed) => ed.status === where.status);
        return Promise.resolve(
          e
            ? {
                ...e,
                eventConfiguration: { evaluationsOpen: e.evaluationsOpen },
              }
            : null,
        );
      }),
    },
    teamFinalScore: {
      findMany: jest.fn(({ where }: { where: { videogameId: IdIn } }) =>
        Promise.resolve(
          data.finalScores.filter((s) =>
            where.videogameId.in.includes(s.videogameId),
          ),
        ),
      ),
    },
    evaluation: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: {
            videogameId: IdIn;
            jurorId?: StringFilter;
            isActive?: boolean;
          };
        }) =>
          Promise.resolve(
            [...data.evaluations]
              .sort((a, b) => a.id - b.id)
              .filter(
                (ev) =>
                  where.videogameId.in.includes(ev.videogameId) &&
                  matchesString(ev.jurorId, where.jurorId) &&
                  (where.isActive === undefined ||
                    ev.isActive === where.isActive),
              ),
          ),
      ),
    },
    historicalTeam: {
      findMany: jest.fn(
        ({
          where,
          orderBy = [],
        }: {
          where: {
            editionId?: number;
            members?: { some: { nrcs: { some: { nrcId: number } } } };
          };
          orderBy?: Partial<Record<'editionId' | 'id', 'asc' | 'desc'>>[];
        }) =>
          Promise.resolve(
            sortByFields(data.historicalTeams, orderBy).filter(
              (t) =>
                (where.editionId === undefined ||
                  t.editionId === where.editionId) &&
                (where.members === undefined ||
                  t.members.some((m) =>
                    m.nrcs.some(
                      (n) => n.nrcId === where.members!.some.nrcs.some.nrcId,
                    ),
                  )),
            ),
          ),
      ),
    },
  };
}

/** `orderBy` de Prisma (lista de campos numéricos) sobre una copia. */
function sortByFields<T extends { editionId: number; id: number }>(
  rows: T[],
  orderBy: Partial<Record<'editionId' | 'id', 'asc' | 'desc'>>[],
): T[] {
  return [...rows].sort((a, b) => {
    for (const clause of orderBy) {
      for (const [field, dir] of Object.entries(clause) as [
        'editionId' | 'id',
        'asc' | 'desc',
      ][]) {
        const diff = a[field] - b[field];
        if (diff !== 0) return dir === 'desc' ? -diff : diff;
      }
    }
    return 0;
  });
}

// ── Datos simulados ─────────────────────────────────────────────────────────

const member = (
  firstName: string,
  lastName: string,
  studentCode: string,
  nrcIds: number[],
  isActive = true,
): FakeMember => ({ firstName, lastName, studentCode, isActive, nrcIds });

const team = (
  id: number,
  teamName: string,
  members: FakeMember[],
  overrides: Partial<FakeTeam> = {},
): FakeTeam => ({
  id,
  teamCode: `T-${id}`,
  teamName,
  editionId: 3,
  isActive: true,
  videogame: { id: id * 100, name: `Juego ${id}`, isActive: true },
  members,
  ...overrides,
});

const nrc = (
  id: number,
  code: number,
  overrides: Partial<FakeNrc> = {},
): FakeNrc => ({
  id,
  code,
  editionId: 3,
  professorId: 'prof-1',
  isActive: true,
  subjectName: 'Algoritmia',
  ...overrides,
});

const buildData = (evaluationsOpen = true): FakePanelData => ({
  editions: [
    {
      id: 3,
      title: 'Feria 2026-2',
      year: 2026,
      semester: 30,
      status: EditionStatus.ACTIVE,
      evaluationsOpen,
    },
    {
      id: 2,
      title: 'Feria 2026-1',
      year: 2026,
      semester: 10,
      status: EditionStatus.ARCHIVED,
      evaluationsOpen: false,
    },
  ],
  nrcs: [
    nrc(10, 2501),
    nrc(11, 2502),
    nrc(12, 2503, { isActive: false }),
    nrc(20, 2601, { professorId: 'prof-2', subjectName: 'Bases de datos' }),
    nrc(30, 2401, { editionId: 2 }),
  ],
  teams: [
    team(1, 'Zeta', [
      member('Ana', 'Gómez', '200111', [10]),
      member('Luis', 'Pérez', '200999', [10], false),
    ]),
    team(2, 'Álamo', [member('José', 'Martínez', '200222', [10, 11])]),
    team(3, 'Beta', [member('Eva', 'Sol', '200333', [10])], {
      isActive: false,
    }),
    team(4, 'Cometa', [member('Iván', 'Mar', '200444', [11], false)]),
    team(5, 'Delta', [member('Olga', 'Paz', '200555', [12])]),
    team(6, 'Eco', [member('Raúl', 'Díaz', '200666', [20])]),
    team(7, 'Faro', [member('Sara', 'Vela', '200777', [30])], {
      editionId: 2,
    }),
    team(8, 'Gama', [member('Tomás', 'Rey', '200888', [11])], {
      videogame: null,
    }),
  ],
  finalScores: [
    { videogameId: 100, finalScore: 4.25, avgJunior: 3.5 },
    { videogameId: 200, finalScore: 3.5, avgJunior: null },
  ],
  evaluations: [
    {
      id: 1,
      videogameId: 100,
      jurorId: 'prof-1',
      totalScore: 4.8,
      isActive: true,
    },
    {
      id: 2,
      videogameId: 200,
      jurorId: 'prof-2',
      totalScore: 2,
      isActive: true,
    },
    {
      id: 3,
      videogameId: 600,
      jurorId: 'prof-2',
      totalScore: 3.9,
      isActive: true,
    },
  ],
  historicalTeams: [
    {
      id: 1,
      teamCode: 'HT-1',
      teamName: 'Histórico',
      editionId: 2,
      isExternal: true,
      videogame: { id: 900, name: 'Juego viejo', finalScore: 4.1 },
      members: [
        {
          firstName: 'Marta',
          lastName: 'Ríos',
          studentCode: '199000',
          nrcs: [{ nrcId: 30, code: 2401 }],
        },
      ],
    },
  ],
});

const listQuery = (
  overrides: Partial<GradingGamesQueryDto> = {},
): GradingGamesQueryDto =>
  ({
    page: 1,
    limit: 25,
    sortBy: 'team',
    sortOrder: 'asc',
    includeHistorical: false,
    ...overrides,
  }) as GradingGamesQueryDto;

const exportQuery = (
  overrides: Partial<GradingReportQueryDto> = {},
): GradingReportQueryDto =>
  ({
    sortBy: 'team',
    sortOrder: 'asc',
    final: false,
    ...overrides,
  }) as GradingReportQueryDto;

const codes = (rows: GradingGameRow[]) => rows.map((r) => r.teamCode);

describe('GradingGamesService (listado del panel, HU-03)', () => {
  let service: GradingGamesService;
  let exporter: GradingReportExportService;
  let prisma: ReturnType<typeof createFakePanelPrisma>;
  const excelExport = {
    generateAndStream: jest.fn<Promise<void>, [ExcelExportOptions, Response]>(),
  };
  const res = {} as Response;

  const setup = async (data = buildData()) => {
    jest.clearAllMocks();
    prisma = createFakePanelPrisma(data);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradingGamesService,
        GradingReportExportService,
        ProfessorPanelQueryService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExcelExportService, useValue: excelExport },
      ],
    }).compile();
    service = module.get(GradingGamesService);
    exporter = module.get(GradingReportExportService);
  };

  /** Códigos de equipo exportados, en orden de hoja y fila. */
  const exportedCodes = async (
    professorId: string,
    q: GradingReportQueryDto,
    roleId?: number,
  ): Promise<string[]> => {
    excelExport.generateAndStream.mockClear();
    try {
      await exporter.exportFiltered(professorId, q, res, roleId);
    } catch (err) {
      if (err instanceof NotFoundException) return [];
      throw err;
    }
    const [options] = excelExport.generateAndStream.mock.calls[0];
    return options.sheets.flatMap((s) =>
      [...s.groups.values()].map((g) => g.teamCode),
    );
  };

  beforeEach(() => setup());

  it('lista solo la feria activa y solo equipos, integrantes y NRC activos', async () => {
    const { data, metadata } = await service.list('prof-1', listQuery());

    // Fuera: T-3 equipo inactivo, T-4 solo integrante inactivo, T-5 NRC
    // inactivo, T-6 NRC de otro profesor, T-7 feria archivada
    expect(codes(data)).toEqual(['T-2', 'T-8', 'T-1']);
    expect(data.every((r) => r.source === 'current')).toBe(true);
    expect(metadata).toEqual({
      totalItems: 3,
      itemsOnCurrentPage: 3,
      currentPage: 1,
      itemsPerPage: 25,
      totalPages: 1,
    });
  });

  it('conserva el formato de fila y las notas de hoy', async () => {
    const { data } = await service.list('prof-1', listQuery());
    const byCode = new Map(data.map((r) => [r.teamCode, r]));

    expect(byCode.get('T-1')).toEqual({
      source: 'current',
      teamCode: 'T-1',
      nrc: '2501',
      team: 'Zeta',
      integrantes: 'Ana Gómez', // el integrante inactivo no aparece
      videogame: 'Juego 1',
      videogameId: 100,
      editionId: 3,
      nrcId: 10,
      calificacionFeria: 4.25,
      calificacionDocente: 4.8,
      isExternal: false,
      fairGradeRule: 'STANDARD',
      rejected: false,
      canEdit: true,
    });
    // Varios NRC del profesor: se listan juntos y nrcId queda en null
    expect(byCode.get('T-2')).toMatchObject({
      nrc: '2501, 2502',
      nrcId: null,
      calificacionFeria: 3.5,
      calificacionDocente: null, // la evaluación es de otro profesor
      canEdit: true,
    });
    // Sin videojuego: se lista (como en la exportación) pero no es editable
    expect(byCode.get('T-8')).toMatchObject({
      videogame: null,
      videogameId: null,
      calificacionFeria: null,
      calificacionDocente: null,
      canEdit: false,
    });
  });

  it('BG-37: un equipo externo sin nota de feria se distingue de uno normal', async () => {
    const data = buildData();
    data.finalScores = [
      { videogameId: 100, finalScore: null, avgJunior: null, isExternal: true },
      { videogameId: 200, finalScore: 3.5, avgJunior: null, isExternal: false },
    ];
    await setup(data);
    const { data: rows } = await service.list('prof-1', listQuery());
    const byCode = new Map(rows.map((r) => [r.teamCode, r]));

    expect(byCode.get('T-1')).toMatchObject({
      calificacionFeria: null,
      calificacionDocente: 4.8,
      isExternal: true,
      fairGradeRule: 'EXTERNAL',
    });
    expect(byCode.get('T-2')).toMatchObject({
      isExternal: false,
      fairGradeRule: 'STANDARD',
    });
    expect(byCode.get('T-8')).toMatchObject({
      isExternal: false, // sin videojuego
      fairGradeRule: 'STANDARD',
    });
  });

  it.each([
    ['N0-COL-1', false, 'SCHOOL'],
    ['N0-COL-1', true, 'SCHOOL'],
    ['N1-ISI-1', true, 'EXTERNAL'],
    ['N1-ISI-1', false, 'STANDARD'],
  ])('BG-37: %s con externo=%s usa la regla %s', (code, isExternal, rule) => {
    expect(fairGradeRuleOf(code, isExternal)).toBe(rule);
  });

  it('canEdit es falso con las evaluaciones cerradas', async () => {
    await setup(buildData(false));
    const { data } = await service.list('prof-1', listQuery());
    expect(data.some((r) => r.canEdit)).toBe(false);
  });

  it.each([
    [{}],
    [{ search: 'martinez' }],
    [{ search: 'zeta' }],
    [{ editionId: 3 }],
    [{ editionId: 2 }],
    [{ sortBy: 'student' as const, sortOrder: 'desc' as const }],
    [{ nrcId: 10, sortOrder: 'desc' as const }],
    [{ nrcId: 11, sortBy: 'student' as const }],
    [{ nrcId: 10, search: '200111' }],
  ])('paridad listado/exportación con el mismo filtro %j', async (filter) => {
    // Equipo con videojuego inactivo: sale en ambos, sin videojuego
    const data = buildData();
    data.teams.push(
      team(9, 'Hielo', [member('Uma', 'Luz', '200901', [10])], {
        videogame: { id: 900, name: 'Juego 9', isActive: false },
      }),
    );
    await setup(data);

    const { data: rows } = await service.list('prof-1', listQuery(filter));
    const listed = codes(rows);
    const exported = await exportedCodes('prof-1', exportQuery(filter));

    const hielo = rows.find((r) => r.teamCode === 'T-9');
    if (hielo) {
      expect(hielo).toMatchObject({ videogame: null, videogameId: null });
      expect(exported).toContain('T-9');
    }

    if ('nrcId' in filter) {
      // Un solo NRC: mismos equipos en el mismo orden
      expect(listed).toEqual(exported);
    } else {
      // Varios NRC: la exportación repite el equipo en cada hoja
      expect(listed).toEqual([...new Set(listed)]);
      expect([...listed].sort()).toEqual([...new Set(exported)].sort());
    }
  });

  it('el equipo con videojuego inactivo aparece en la paridad sin filtros', async () => {
    const data = buildData();
    data.teams.push(
      team(9, 'Hielo', [member('Uma', 'Luz', '200901', [10])], {
        videogame: { id: 900, name: 'Juego 9', isActive: false },
      }),
    );
    await setup(data);
    const { data: rows } = await service.list('prof-1', listQuery());
    expect(codes(rows)).toContain('T-9');
  });

  it.each([
    ['inactiva', { totalScore: 4.8, isActive: false }],
    ['sin nota', { totalScore: null, isActive: true }],
  ])(
    'calificacionDocente ignora la evaluación %s, igual que la exportación',
    async (_label, first) => {
      const data = buildData();
      data.evaluations = [
        { id: 1, videogameId: 100, jurorId: 'prof-1', ...first },
        {
          id: 5,
          videogameId: 100,
          jurorId: 'prof-1',
          totalScore: 2,
          isActive: true,
        },
      ];
      await setup(data);

      const { data: rows } = await service.list('prof-1', listQuery());
      expect(rows.find((r) => r.teamCode === 'T-1')?.calificacionDocente).toBe(
        2,
      );

      excelExport.generateAndStream.mockClear();
      await exporter.exportFiltered('prof-1', exportQuery(), res);
      const [options] = excelExport.generateAndStream.mock.calls[0];
      await expect(options.getDocenteScore(100, 'prof-1')).resolves.toBe(2);
    },
  );

  it('los históricos empatados se ordenan por feria (reciente primero) e id, y paginan estable', async () => {
    const data = buildData();
    const twin = (id: number, editionId: number) => ({
      ...data.historicalTeams[0],
      id,
      editionId,
    });
    // Mismo nombre y código en varias ferias: solo los desempata la consulta
    data.historicalTeams = [twin(4, 1), twin(2, 2), twin(3, 1), twin(1, 2)];
    data.editions.push({ ...data.editions[1], id: 1 });
    await setup(data);

    const all = await service.list(
      'prof-1',
      listQuery({ includeHistorical: true }),
    );
    const historicalKeys = all.data
      .filter((r) => r.source === 'historical')
      .map((r) => r.editionId);
    expect(historicalKeys).toEqual([2, 2, 1, 1]);
    expect(prisma.historicalTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ editionId: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it.each([
    ['nombre de equipo', 'zeta', ['T-1']],
    ['código de equipo', 't-2', ['T-2']],
    ['nombre de estudiante', 'jose martinez', ['T-2']],
    ['código de estudiante', '200111', ['T-1']],
    ['integrante inactivo', 'luis', []],
    ['código de integrante inactivo', '200999', []],
  ])('search busca por %s', async (_label, search, expected) => {
    const { data } = await service.list('prof-1', listQuery({ search }));
    expect(codes(data)).toEqual(expected);
  });

  it('team y student siguen funcionando como alias de search', async () => {
    const run = async (q: Partial<GradingGamesQueryDto>) =>
      codes((await service.list('prof-1', listQuery(q))).data);

    expect(await run({ team: 'zeta' })).toEqual(['T-1']);
    expect(await run({ student: '200222' })).toEqual(['T-2']);
    // Si vienen ambos, search gana
    expect(await run({ search: 'zeta', team: 'alamo' })).toEqual(['T-1']);
  });

  it('por defecto no incluye históricos; includeHistorical=true los agrega al final', async () => {
    const plain = await service.list('prof-1', listQuery());
    expect(plain.data.some((r) => r.source === 'historical')).toBe(false);
    expect(prisma.historicalTeam.findMany).not.toHaveBeenCalled();

    const withHistory = await service.list(
      'prof-1',
      listQuery({ includeHistorical: true }),
    );
    expect(codes(withHistory.data)).toEqual(['T-2', 'T-8', 'T-1', 'HT-1']);
    expect(withHistory.data[3]).toEqual({
      source: 'historical',
      teamCode: 'HT-1',
      nrc: '2401',
      team: 'Histórico',
      integrantes: 'Marta Ríos',
      videogame: 'Juego viejo',
      videogameId: 900,
      editionId: 2,
      nrcId: 30,
      calificacionFeria: 4.1,
      calificacionDocente: null,
      isExternal: true,
      fairGradeRule: 'EXTERNAL',
      rejected: false,
      canEdit: false,
    });
    expect(withHistory.metadata.totalItems).toBe(4);
  });

  it('los históricos también se filtran con search', async () => {
    const { data } = await service.list(
      'prof-1',
      listQuery({ includeHistorical: true, search: 'marta rios' }),
    );
    expect(codes(data)).toEqual(['HT-1']);
  });

  it('NRC fuera de la feria activa: 404 en el listado, salvo con includeHistorical', async () => {
    await expect(
      service.list('prof-1', listQuery({ nrcId: 30 })),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { data } = await service.list(
      'prof-1',
      listQuery({ nrcId: 30, includeHistorical: true }),
    );
    expect(codes(data)).toEqual(['HT-1']);
  });

  it('pagina después de filtrar y ordenar', async () => {
    const { data, metadata } = await service.list(
      'prof-1',
      listQuery({ page: 2, limit: 2 }),
    );
    expect(codes(data)).toEqual(['T-1']);
    expect(metadata).toEqual({
      totalItems: 3,
      itemsOnCurrentPage: 1,
      currentPage: 2,
      itemsPerPage: 2,
      totalPages: 2,
    });
  });

  it('el profesor solo ve y exporta sus NRC', async () => {
    const listed = codes((await service.list('prof-2', listQuery())).data);
    expect(listed).toEqual(['T-6']);
    expect(await exportedCodes('prof-2', exportQuery())).toEqual(['T-6']);
  });

  describe('Administrador (M4)', () => {
    it('exporta todos los NRC activos de la feria activa', async () => {
      excelExport.generateAndStream.mockClear();
      await exporter.exportFiltered(
        'admin-1',
        exportQuery(),
        res,
        ROLE_IDS.ADMIN,
      );

      const [options] = excelExport.generateAndStream.mock.calls[0];
      expect(options.sheets.map((s) => s.nrcCode)).toEqual([
        '2501',
        '2502',
        '2601',
      ]);
      // La nota docente de cada hoja es la del profesor dueño del NRC
      const ecoSheet = options.sheets[2];
      expect(ecoSheet.professorId).toBe('prof-2');
      await expect(options.getDocenteScore(600, 'prof-2')).resolves.toBe(3.9);
      expect(options.sheets[0].professorId).toBe('prof-1');
      await expect(options.getDocenteScore(100, 'prof-1')).resolves.toBe(4.8);
      await expect(options.getDocenteScore(100, 'admin-1')).resolves.toBeNull();
    });

    it('lista lo mismo que exporta, sin poder editar', async () => {
      const { data } = await service.list(
        'admin-1',
        listQuery(),
        ROLE_IDS.ADMIN,
      );
      expect(codes(data)).toEqual(['T-2', 'T-6', 'T-8', 'T-1']);
      expect(data.some((r) => r.canEdit)).toBe(false);
      const eco = data.find((r) => r.teamCode === 'T-6');
      expect(eco?.calificacionDocente).toBe(3.9);

      const exported = await exportedCodes(
        'admin-1',
        exportQuery(),
        ROLE_IDS.ADMIN,
      );
      expect([...codes(data)].sort()).toEqual([...new Set(exported)].sort());
    });

    it('un rol distinto de Administrador no amplía el alcance', async () => {
      expect(
        await exportedCodes('admin-1', exportQuery(), ROLE_IDS.PROFESSOR),
      ).toEqual([]);
    });
  });
});
