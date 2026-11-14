import { BadRequestException, NotFoundException } from '@nestjs/common';
import { editionIdQuery } from './list-edition';
import { TeamsService } from '../teams/services/teams.service';
import { PendingGamesService } from 'src/pending-games/pending-games.service';
import { GradedGamesService } from 'src/graded-games/graded-games.service';
import { ProfessorsService } from '../professors/professors.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * ARK-132 (BG-19): las listas de equipos, jurados y el panel del jurado no mezclan ediciones.
 * La prueba con dos ediciones reales está en `src/juror/edition-lists.db.spec.ts`.
 */
const ACTIVE = { id: 5, title: 'E5', status: 'ACTIVE' };

describe('editionIdQuery (?editionId=)', () => {
  it('omitido = la edición activa (undefined)', () => {
    expect(editionIdQuery(undefined)).toBeUndefined();
    expect(editionIdQuery('')).toBeUndefined();
  });

  it('un entero positivo pasa como número', () => {
    expect(editionIdQuery('4')).toBe(4);
  });

  it.each(['abc', '0', '-1', '1.5'])('«%s» responde 400', (raw) => {
    expect(() => editionIdQuery(raw)).toThrow(BadRequestException);
  });
});

describe('GET /teams/incomplete-jurors (TeamsService)', () => {
  const prisma = { edition: { findFirst: jest.fn(), findUnique: jest.fn() } };
  const repository = { getTeamsWithLessThanThreeJurors: jest.fn() };
  const service = Object.assign(Object.create(TeamsService.prototype), {
    prisma,
    teamRepository: repository,
  }) as TeamsService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getTeamsWithLessThanThreeJurors.mockResolvedValue([{ id: 1 }]);
  });

  it('por defecto consulta solo la edición activa', async () => {
    prisma.edition.findFirst.mockResolvedValue(ACTIVE);
    await expect(service.getTeamsWithLessThanThreeJurors()).resolves.toEqual([{ id: 1 }]);
    expect(repository.getTeamsWithLessThanThreeJurors).toHaveBeenCalledWith(5);
  });

  it('con editionId consulta esa edición (historial)', async () => {
    prisma.edition.findUnique.mockResolvedValue({ id: 4, title: 'E4', status: 'INACTIVE' });
    await service.getTeamsWithLessThanThreeJurors(4);
    expect(repository.getTeamsWithLessThanThreeJurors).toHaveBeenCalledWith(4);
  });

  it('sin edición activa devuelve [] sin consultar equipos', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(service.getTeamsWithLessThanThreeJurors()).resolves.toEqual([]);
    expect(repository.getTeamsWithLessThanThreeJurors).not.toHaveBeenCalled();
  });

  it('una edición que no existe responde 404', async () => {
    prisma.edition.findUnique.mockResolvedValue(null);
    await expect(service.getTeamsWithLessThanThreeJurors(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('Panel del jurado: solo la edición activa', () => {
  const prisma = {
    eventConfiguration: { findFirst: jest.fn() },
    videogame: { findMany: jest.fn(), count: jest.fn() },
    evaluation: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const activeTeam = expect.objectContaining({
    team: expect.objectContaining({
      edition: { status: 'ACTIVE' },
      assignedJurors: { some: { id: 'j1' } },
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    prisma.eventConfiguration.findFirst.mockResolvedValue({ evaluationsOpen: true });
    prisma.videogame.findMany.mockResolvedValue([]);
    prisma.videogame.count.mockResolvedValue(0);
    prisma.evaluation.findMany.mockResolvedValue([]);
  });

  it('pendientes: los cuatro métodos filtran por la edición activa', async () => {
    const pending = new PendingGamesService(prisma as never, blobRefsPassthrough());
    await pending.getPendingVideogames('j1', 10, 1);
    await pending.getPendingVideogamesCount('j1');
    await pending.searchPendingGames('j1', 'x');
    await pending.quickSearchPendingGames('j1', 'x');

    const wheres = [
      ...prisma.videogame.findMany.mock.calls.map(([arg]) => arg.where),
      ...prisma.videogame.count.mock.calls.map(([arg]) => arg.where),
    ];
    expect(wheres).toHaveLength(5);
    for (const where of wheres) {
      expect(where.AND).toEqual(expect.arrayContaining([activeTeam]));
    }
  });

  it('calificados: las evaluaciones del jurado son solo de juegos de la edición activa', async () => {
    const graded = new GradedGamesService(prisma as never, blobRefsPassthrough());
    await graded.getGradedVideogames('j1', 10, 1);
    await graded.getGradedVideogamesCount('j1');
    await graded.searchGradedGames('j1', 'x');
    await graded.quickSearchGradedGames('j1', 'x');

    expect(prisma.evaluation.findMany).toHaveBeenCalledTimes(4);
    for (const [arg] of prisma.evaluation.findMany.mock.calls) {
      expect(arg.where).toEqual({
        jurorId: 'j1',
        isActive: true,
        // ARK-147: solo evaluaciones de jurado (con detalles), no la nota del NRC
        details: { some: {} },
        videogame: { team: { edition: { status: 'ACTIVE' }, notGradable: false } },
      });
    }
  });
});

describe('GET /professors/juror-evaluations', () => {
  const prisma = {
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    evaluation: { findMany: jest.fn() },
    teamFinalScore: { findMany: jest.fn() },
  };
  const service = new ProfessorsService({} as any, prisma as any, {} as any);
  const row = {
    videogameId: 9,
    totalScore: 4,
    videogame: {
      id: 9,
      name: 'Juego',
      team: { teamName: 'Equipo', teamCode: 'N1-X-101', isExternal: false, members: [] },
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.evaluation.findMany.mockResolvedValue([row]);
    prisma.teamFinalScore.findMany.mockResolvedValue([]);
  });

  it('por defecto filtra por la edición activa y la devuelve', async () => {
    prisma.edition.findFirst.mockResolvedValue(ACTIVE);
    const result = await service.getJurorEvaluations('p1', 20, 1);
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jurorId: 'p1',
          isActive: true,
          details: { some: {} },
          videogame: { team: { editionId: 5, notGradable: false } },
        },
      }),
    );
    expect(result.edition).toEqual({ ...ACTIVE, readOnly: false });
    expect(result.data).toHaveLength(1);
  });

  it('HU-34: calificacionFeria es la nota final; la que puso el profesor va en miEvaluacion', async () => {
    prisma.edition.findFirst.mockResolvedValue(ACTIVE);
    prisma.teamFinalScore.findMany.mockResolvedValue([
      { videogameId: row.videogameId, finalScore: 4.1 },
    ]);
    const result = await service.getJurorEvaluations('p1', 20, 1);
    expect(result.data[0]).toMatchObject({
      calificacionFeria: 4.1,
      miEvaluacion: row.totalScore,
    });
  });

  it('HU-34: sin nota final, calificacionFeria es null (no la nota del profesor)', async () => {
    prisma.edition.findFirst.mockResolvedValue(ACTIVE);
    const result = await service.getJurorEvaluations('p1', 20, 1);
    expect(result.data[0].calificacionFeria).toBeNull();
  });

  it('con editionId devuelve el historial en solo lectura', async () => {
    prisma.edition.findUnique.mockResolvedValue({ id: 4, title: 'E4', status: 'INACTIVE' });
    const result = await service.getJurorEvaluations('p1', 20, 1, 4);
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jurorId: 'p1',
          isActive: true,
          details: { some: {} },
          videogame: { team: { editionId: 4, notGradable: false } },
        },
      }),
    );
    expect(result.edition).toMatchObject({ id: 4, readOnly: true });
  });

  it('sin edición activa: edition null y ninguna evaluación', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    prisma.evaluation.findMany.mockResolvedValue([]);
    const result = await service.getJurorEvaluations('p1', 20, 1);
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jurorId: 'p1',
          isActive: true,
          details: { some: {} },
          videogame: { team: { editionId: -1, notGradable: false } },
        },
      }),
    );
    expect(result).toMatchObject({ edition: null, data: [], metadata: { totalItems: 0 } });
  });
});
