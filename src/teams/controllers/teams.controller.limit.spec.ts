import { BadRequestException } from '@nestjs/common';
import { MAX_TEAMS_LIST_LIMIT, TeamsController } from './teams.controller';

/** M9: el listado público de equipos respeta `limit` y lo recorta a 100; sin `limit` no cambia. */
describe('TeamsController.getTeams — limit (M9)', () => {
  const service = { findAll: jest.fn(), findPaged: jest.fn() };
  const controller = new TeamsController(service as any);

  beforeEach(() => jest.resetAllMocks());

  it('sin limit devuelve la lista completa como hasta ahora', () => {
    controller.getTeams(false, undefined, undefined, undefined, true);
    expect(service.findAll).toHaveBeenCalledWith(true, false, undefined, undefined);
    expect(service.findPaged).not.toHaveBeenCalled();
  });

  it('con solo limit pagina desde la página 1', () => {
    controller.getTeams(false, undefined, undefined, '10');
    expect(service.findPaged).toHaveBeenCalledWith(1, 10, false, false, undefined, undefined);
  });

  it('ARK-129: editionId se pasa al servicio (paginado y lista completa)', () => {
    controller.getTeams(true, undefined, '1', '10', undefined, '4');
    expect(service.findPaged).toHaveBeenCalledWith(1, 10, false, true, undefined, 4);
    controller.getTeams(false, undefined, undefined, undefined, undefined, '4');
    expect(service.findAll).toHaveBeenCalledWith(false, false, undefined, 4);
  });

  it('ARK-129: editionId inválido responde 400', () => {
    for (const bad of ['abc', '0', '-3', '2.5']) {
      expect(() => controller.getTeams(false, undefined, undefined, undefined, undefined, bad)).toThrow(BadRequestException);
    }
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('el tope propio de /teams es 1000', () => {
    expect(MAX_TEAMS_LIST_LIMIT).toBe(1000);
  });

  it('recorta limit=5000 a 1000', () => {
    controller.getTeams(false, undefined, '2', '5000');
    expect(service.findPaged).toHaveBeenCalledWith(2, 1000, false, false, undefined, undefined);
  });

  it('limit=999999 (vista «Todos» del admin) pide hasta 1000, no 100', () => {
    controller.getTeams(true, undefined, '1', '999999');
    expect(service.findPaged).toHaveBeenCalledWith(1, 1000, false, true, undefined, undefined);
  });

  it('limit=null (lo manda juryManagement) devuelve la lista completa como antes', () => {
    controller.getTeams(false, undefined, '1', 'null');
    expect(service.findAll).toHaveBeenCalledWith(false, false, undefined, undefined);
    expect(service.findPaged).not.toHaveBeenCalled();
  });

  it('un page suelto sin limit devuelve la lista completa', () => {
    controller.getTeams(false, undefined, '3');
    expect(service.findAll).toHaveBeenCalledWith(false, false, undefined, undefined);
    expect(service.findPaged).not.toHaveBeenCalled();
  });
});

/** M9: con 150 equipos y limit=999999 el repositorio entrega los 150 y metadatos coherentes. */
describe('TeamRepository.findPaged — metadatos con limit recortado (M9)', () => {
  it('150 equipos, página 1, límite 1000: 150 ítems, 1 página', async () => {
    const { TeamRepository } = await import('../repositories/team.repository');
    const teams = Array.from({ length: 150 }, (_, i) => ({ id: i + 1 }));
    const prisma = {
      team: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([teams, 150]),
    };
    const repo = new TeamRepository(prisma as any, {} as any);
    const res = await repo.findPaged(1, Math.min(999999, MAX_TEAMS_LIST_LIMIT));
    expect(res.data).toHaveLength(150);
    expect(res.metaData).toMatchObject({
      totalItems: 150,
      totalPages: 1,
      itemsPerPage: 1000,
      itemsOnCurrentPage: 150,
      hasNextPage: false,
    });
  });
});
