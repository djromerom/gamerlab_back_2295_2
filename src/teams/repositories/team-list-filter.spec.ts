import { BadRequestException } from '@nestjs/common';
import {
  buildTeamListWhere,
  filterTeamIdsBySearch,
  parseTeamListFilters,
  resolveTeamListWhere,
} from './team-list-filter';
import { TeamRepository } from './team.repository';

/** BG-53 (ARK-253): `search` y `origin` de GET /teams. */
describe('team-list-filter (BG-53)', () => {
  const teams = [
    { id: 1, teamName: 'Los Cóndores', teamCode: 'N1-001', videogame: { name: 'Vuelo Andino' } },
    { id: 2, teamName: 'Pixel Team', teamCode: 'N2-014', videogame: { name: 'Mazmorra Ñandú' } },
    { id: 3, teamName: 'Sin juego', teamCode: 'N3-020', videogame: null },
  ];

  describe('parseTeamListFilters', () => {
    it('acepta origin uninorte y externo', () => {
      expect(parseTeamListFilters(undefined, 'uninorte')).toEqual({ origin: 'uninorte' });
      expect(parseTeamListFilters(undefined, 'externo')).toEqual({ origin: 'externo' });
    });

    it('origin desconocido responde 400', () => {
      for (const bad of ['externos', 'Externo', 'true', 'x', ['externo']]) {
        expect(() => parseTeamListFilters(undefined, bad)).toThrow(BadRequestException);
      }
    });

    it('sin search ni origin (o vacíos) no filtra nada', () => {
      expect(parseTeamListFilters(undefined, undefined)).toEqual({});
      expect(parseTeamListFilters('   ', '')).toEqual({});
    });

    it('recorta search', () => {
      expect(parseTeamListFilters('  cóndor ')).toEqual({ search: 'cóndor' });
    });
  });

  describe('buildTeamListWhere', () => {
    it('sin edición ni origen queda undefined, como antes', () => {
      expect(buildTeamListWhere(undefined, {})).toBeUndefined();
      expect(buildTeamListWhere(4)).toEqual({ editionId: 4 });
    });

    it('origin se traduce a isExternal', () => {
      expect(buildTeamListWhere(4, { origin: 'externo' })).toEqual({ editionId: 4, isExternal: true });
      expect(buildTeamListWhere(4, { origin: 'uninorte' })).toEqual({ editionId: 4, isExternal: false });
    });
  });

  describe('filterTeamIdsBySearch', () => {
    it('ignora tildes y mayúsculas', () => {
      expect(filterTeamIdsBySearch(teams, 'CONDORES')).toEqual([1]);
      expect(filterTeamIdsBySearch(teams, 'nandu')).toEqual([2]);
    });

    it('busca por código del equipo', () => {
      expect(filterTeamIdsBySearch(teams, 'n2-014')).toEqual([2]);
      expect(filterTeamIdsBySearch(teams, 'N3')).toEqual([3]);
    });

    it('busca por nombre del juego', () => {
      expect(filterTeamIdsBySearch(teams, 'andino')).toEqual([1]);
    });

    it('con varias palabras exige todas (equipo + juego + código)', () => {
      expect(filterTeamIdsBySearch(teams, 'condores vuelo n1')).toEqual([1]);
      expect(filterTeamIdsBySearch(teams, 'condores mazmorra')).toEqual([]);
    });
  });

  describe('resolveTeamListWhere', () => {
    it('sin search no consulta candidatos', async () => {
      const prisma = { team: { findMany: jest.fn() } };
      await expect(resolveTeamListWhere(prisma as any, 4, { origin: 'externo' })).resolves.toEqual({
        editionId: 4,
        isExternal: true,
      });
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });

    it('con search trae solo datos públicos con el where base y restringe a los ids', async () => {
      const prisma = { team: { findMany: jest.fn().mockResolvedValue(teams) } };
      const where = await resolveTeamListWhere(prisma as any, 4, { search: 'condor', origin: 'uninorte' });
      expect(prisma.team.findMany).toHaveBeenCalledWith({
        where: { editionId: 4, isExternal: false },
        select: { id: true, teamName: true, teamCode: true, videogame: { select: { name: true } } },
      });
      expect(where).toEqual({ editionId: 4, isExternal: false, id: { in: [1] } });
    });
  });

  it('TeamRepository.findPaged pagina y cuenta con el where filtrado', async () => {
    const prisma = {
      team: { findMany: jest.fn().mockResolvedValue(teams), count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([[teams[1]], 1]),
    };
    const repo = new TeamRepository(prisma as any, {} as any);
    const res = await repo.findPaged(1, 10, false, 4, { search: 'nandu' });
    const filtered = { editionId: 4, id: { in: [2] } };
    expect(prisma.team.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: filtered, skip: 0, take: 10 }));
    expect(prisma.team.count).toHaveBeenCalledWith({ where: filtered });
    expect(res.metaData).toMatchObject({ totalItems: 1, totalPages: 1 });
  });
});
