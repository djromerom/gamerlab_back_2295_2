import { TeamsController } from './teams.controller';

/** M9: el listado público de equipos respeta `limit` y lo recorta a 100; sin `limit` no cambia. */
describe('TeamsController.getTeams — limit (M9)', () => {
  const service = { findAll: jest.fn(), findPaged: jest.fn() };
  const controller = new TeamsController(service as any);

  beforeEach(() => jest.resetAllMocks());

  it('sin limit devuelve la lista completa como hasta ahora', () => {
    controller.getTeams(false, undefined, undefined, true);
    expect(service.findAll).toHaveBeenCalledWith(true, false);
    expect(service.findPaged).not.toHaveBeenCalled();
  });

  it('con solo limit pagina desde la página 1', () => {
    controller.getTeams(false, undefined, '10');
    expect(service.findPaged).toHaveBeenCalledWith(1, 10, false, false);
  });

  it('recorta limit=100000 a 100', () => {
    controller.getTeams(false, '2', '100000');
    expect(service.findPaged).toHaveBeenCalledWith(2, 100, false, false);
  });
});
