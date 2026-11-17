import { BadRequestException } from '@nestjs/common';
import { TeamsController } from './teams.controller';

/** BG-53 (ARK-253): GET /teams pasa `search` y `origin` al servicio y valida `origin`. */
describe('TeamsController.getTeams — search y origin (BG-53)', () => {
  const service = { findAll: jest.fn(), findPaged: jest.fn() };
  const controller = new TeamsController(service as any);

  beforeEach(() => jest.resetAllMocks());

  it('search y origin llegan al servicio paginado', () => {
    controller.getTeams(true, undefined, '1', '10', undefined, '4', ' cóndor ', 'externo');
    expect(service.findPaged).toHaveBeenCalledWith(1, 10, false, true, undefined, 4, {
      search: 'cóndor',
      origin: 'externo',
    });
  });

  it('search y origin llegan también a la lista completa (sin limit)', () => {
    controller.getTeams(false, undefined, undefined, undefined, true, undefined, 'N1-004', 'uninorte');
    expect(service.findAll).toHaveBeenCalledWith(true, false, undefined, undefined, {
      search: 'N1-004',
      origin: 'uninorte',
    });
  });

  it('origin inválido responde 400 y no consulta', () => {
    for (const bad of ['externos', 'todos', 'EXTERNO']) {
      expect(() => controller.getTeams(true, undefined, '1', '10', undefined, undefined, undefined, bad)).toThrow(
        BadRequestException,
      );
    }
    expect(service.findPaged).not.toHaveBeenCalled();
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('search u origin vacíos equivalen a no enviarlos', () => {
    controller.getTeams(true, undefined, '1', '10', undefined, undefined, '  ', '');
    expect(service.findPaged).toHaveBeenCalledWith(1, 10, false, true, undefined, undefined, {});
  });
});
