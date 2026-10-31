import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VideogamesService } from './videogames.service';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * BG-01 — Un estudiante solo puede modificar SU videojuego, y el estado de
 * aprobación lo cambia únicamente un administrador.
 */
describe('VideogamesService.update — propiedad (BG-01)', () => {
  const prisma = {
    videogame: { findUnique: jest.fn(), update: jest.fn() },
  };
  const service = new VideogamesService(prisma as any, {} as any);

  const game = { id: 7, team: { userId: 'leader-1' } };
  const student = (id: string) => ({ id, roleId: ROLE_IDS.STUDENT }) as any;
  const admin = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.videogame.findUnique.mockResolvedValue(game);
    prisma.videogame.update.mockResolvedValue({ id: 7 });
  });

  it('permite al líder del equipo modificar su propio videojuego', async () => {
    await service.update(
      7,
      { vgName: 'Nuevo nombre' } as any,
      student('leader-1'),
    );

    expect(prisma.videogame.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { name: 'Nuevo nombre' },
    });
  });

  it('rechaza a un estudiante que NO es el líder del equipo y no escribe nada', async () => {
    await expect(
      service.update(
        7,
        { vgName: 'Hackeado' } as any,
        student('otro-estudiante'),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.videogame.update).not.toHaveBeenCalled();
  });

  it('rechaza a un estudiante que intenta cambiar el estado de su propio videojuego', async () => {
    await expect(
      service.update(7, { videogameStatusId: 1 } as any, student('leader-1')),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.videogame.update).not.toHaveBeenCalled();
  });

  it('permite al administrador modificar cualquier videojuego, incluido su estado', async () => {
    await service.update(7, { videogameStatusId: 3 } as any, admin);

    expect(prisma.videogame.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { videogameStatusId: 3 },
    });
  });

  it('rechaza a un estudiante que envía `name` (solo el administrador lo fija directamente)', async () => {
    await expect(
      service.update(7, { name: 'Otro' } as any, student('leader-1')),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.videogame.update).not.toHaveBeenCalled();
  });

  it('responde 404 si el videojuego no existe', async () => {
    prisma.videogame.findUnique.mockResolvedValue(null);

    await expect(service.update(99, {} as any, admin)).rejects.toThrow(
      NotFoundException,
    );
  });
});
