import { TeamRepository } from './team.repository';

/** F4: `%` y `_` no deben actuar como comodines en la búsqueda por nombre. */
describe('TeamRepository — escape de comodines en búsquedas por nombre (F4)', () => {
  const prisma = {
    team: { findFirst: jest.fn().mockResolvedValue(null) },
    videogame: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const repository = new TeamRepository(prisma as any, {} as any);

  it('findByVideogameName escapa % y _ (solo en la edición activa, ARK-128)', async () => {
    await repository.findByVideogameName('%_');
    expect(prisma.videogame.findFirst).toHaveBeenCalledWith({
      where: {
        name: { equals: '\\%\\_', mode: 'insensitive' },
        team: { edition: { status: 'ACTIVE' } },
      },
    });
  });

  it('findByTeamName escapa % y _ (solo en la edición activa, ARK-128)', async () => {
    await repository.findByTeamName('50%');
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: {
        teamName: { equals: '50\\%', mode: 'insensitive' },
        edition: { status: 'ACTIVE' },
      },
    });
  });
});
