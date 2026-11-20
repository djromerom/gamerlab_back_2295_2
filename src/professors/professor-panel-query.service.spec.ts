import { NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  matchesSearch,
  PanelTeam,
  ProfessorPanelQueryService,
  sortPanelTeams,
} from './professor-panel-query.service';
import { ProfessorPanelQueryDto } from './dto/professor-panel-query.dto';

const member = (firstName: string, lastName: string, studentCode = '200') => ({
  firstName,
  lastName,
  studentCode,
  fullName: `${firstName} ${lastName}`,
});

const panelTeam = (
  teamId: number,
  teamName: string,
  members: ReturnType<typeof member>[],
): PanelTeam => ({
  teamId,
  teamCode: `T-${teamId}`,
  teamName,
  videogameId: teamId,
  videogameName: `Juego ${teamId}`,
  members,
});

const filters = (
  overrides: Partial<ProfessorPanelQueryDto> = {},
): ProfessorPanelQueryDto => ({
  sortBy: 'team',
  sortOrder: 'asc',
  ...overrides,
});

describe('matchesSearch', () => {
  const team = panelTeam(1, 'Los Dragones', [
    member('José', 'Martínez', '200111'),
    member('Ana', 'Ruiz', '200222'),
  ]);

  it('sin búsqueda incluye el equipo', () => {
    expect(matchesSearch(team)).toBe(true);
    expect(matchesSearch(team, '   ')).toBe(true);
  });

  it('ignora tildes y mayúsculas', () => {
    expect(matchesSearch(team, 'MARTINEZ')).toBe(true);
    expect(matchesSearch(team, 'dragónes')).toBe(true);
  });

  it('busca por código de estudiante y nombre completo de un mismo integrante', () => {
    expect(matchesSearch(team, '200222')).toBe(true);
    expect(matchesSearch(team, 'jose martinez')).toBe(true);
  });

  it('no mezcla palabras de integrantes distintos', () => {
    expect(matchesSearch(team, 'jose ruiz')).toBe(false);
    expect(matchesSearch(team, 'pedro')).toBe(false);
  });
});

describe('sortPanelTeams', () => {
  const teams = [
    panelTeam(1, 'Beta', [member('Zoe', 'Díaz')]),
    panelTeam(2, 'Álamo', [member('Carlos', 'Ruiz'), member('Mario', 'Paz')]),
    panelTeam(3, 'Cometa', [member('Ana', 'López')]),
  ];
  const ids = (list: PanelTeam[]) => list.map((t) => t.teamId);

  it('ordena por equipo asc/desc respetando tildes', () => {
    expect(ids(sortPanelTeams(teams, 'team', 'asc'))).toEqual([2, 1, 3]);
    expect(ids(sortPanelTeams(teams, 'team', 'desc'))).toEqual([3, 1, 2]);
  });

  it('ordena por estudiante usando el primer (asc) o último (desc) integrante', () => {
    expect(ids(sortPanelTeams(teams, 'student', 'asc'))).toEqual([3, 2, 1]);
    expect(ids(sortPanelTeams(teams, 'student', 'desc'))).toEqual([1, 2, 3]);
  });

  it('no modifica el arreglo original', () => {
    sortPanelTeams(teams, 'team', 'desc');
    expect(ids(teams)).toEqual([1, 2, 3]);
  });
});

describe('ProfessorPanelQueryService', () => {
  let service: ProfessorPanelQueryService;
  const prisma = {
    nRC: { findMany: jest.fn() },
    team: { findMany: jest.fn() },
  };

  const edition = { id: 3, title: 'Feria 2026-2', year: 2026, semester: 30 };
  const nrcA = {
    id: 10,
    code: 2501,
    editionId: 3,
    subject: { name: 'Algoritmia' },
    edition,
  };
  const nrcB = { ...nrcA, id: 11, code: 2502 };

  const dbTeam = (
    id: number,
    teamName: string,
    nrcIds: number[],
    editionId = 3,
    videogameActive = true,
  ) => ({
    id,
    teamCode: `T-${id}`,
    teamName,
    editionId,
    videogame: { id: id * 100, name: `Juego ${id}`, isActive: videogameActive },
    members: [
      {
        firstName: 'Ana',
        lastName: `Equipo${id}`,
        studentCode: `${id}`,
        nrcs: nrcIds.map((n) => ({ id: n })),
      },
    ],
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfessorPanelQueryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProfessorPanelQueryService);
  });

  it('filtra NRC por profesor, feria activa, feria, NRC e isActive', async () => {
    prisma.nRC.findMany.mockResolvedValue([nrcA]);
    prisma.team.findMany.mockResolvedValue([]);

    await service.findPanelGroups(
      'prof-1',
      filters({ editionId: 3, nrcId: 10 }),
    );

    expect(prisma.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          professorId: 'prof-1',
          isActive: true,
          edition: { status: EditionStatus.ACTIVE },
          editionId: 3,
          id: 10,
        },
      }),
    );
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          notGradable: false, // HU-39 (ARK-209)
          members: {
            some: { isActive: true, nrcs: { some: { id: { in: [10] } } } },
          },
        },
      }),
    );
  });

  it('sin filtros consulta solo los NRC activos del profesor en la feria activa', async () => {
    prisma.nRC.findMany.mockResolvedValue([]);

    const result = await service.findPanelGroups('prof-1', filters());

    expect(prisma.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          professorId: 'prof-1',
          isActive: true,
          edition: { status: EditionStatus.ACTIVE },
        },
      }),
    );
    expect(result).toEqual([]);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it('una feria archivada o inactiva no devuelve resultados', async () => {
    // Prisma no encuentra NRC: la feria pedida no cumple status = ACTIVE
    prisma.nRC.findMany.mockResolvedValue([]);

    const result = await service.findPanelGroups(
      'prof-1',
      filters({ editionId: 1 }),
    );

    expect(prisma.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          edition: { status: EditionStatus.ACTIVE },
          editionId: 1,
        }) as unknown,
      }),
    );
    expect(result).toEqual([]);
  });

  it('NRC de otro profesor, de otra feria o de una feria no activa ⇒ NotFoundException', async () => {
    prisma.nRC.findMany.mockResolvedValue([]);

    await expect(
      service.findPanelGroups('prof-1', filters({ nrcId: 99 })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('agrupa equipos por NRC, descarta otra feria, aplica búsqueda y orden', async () => {
    prisma.nRC.findMany.mockResolvedValue([nrcA, nrcB]);
    prisma.team.findMany.mockResolvedValue([
      dbTeam(1, 'Zeta', [10]),
      dbTeam(2, 'Alfa', [10, 11]),
      dbTeam(3, 'Beta', [10], 2), // otra feria: no debe salir
      dbTeam(4, 'Gamma', [11], 3, false), // videojuego inactivo
    ]);

    const result = await service.findPanelGroups('prof-1', filters());

    expect(result.map((g) => g.nrcCode)).toEqual([2501, 2502]);
    expect(result[0].teams.map((t) => t.teamName)).toEqual(['Alfa', 'Zeta']);
    expect(result[1].teams.map((t) => t.teamName)).toEqual(['Alfa', 'Gamma']);
    expect(result[1].teams[1].videogameId).toBeNull();

    const searched = await service.findPanelGroups(
      'prof-1',
      filters({ search: 'zeta' }),
    );
    expect(searched[0].teams.map((t) => t.teamName)).toEqual(['Zeta']);
    expect(searched[1].teams).toEqual([]);
  });
});
