import { NotFoundException } from '@nestjs/common';
import { StudentsService } from './students.service';

/**
 * ARK-128: un líder puede tener equipos en varias ediciones; los paneles del estudiante usan
 * el de la edición activa. Sin equipo en la activa, 404 (aún no se ha inscrito).
 */
describe('StudentsService — equipo de la edición activa (ARK-128)', () => {
  const activeTeamWhere = { userId: 'u-4', edition: { status: 'ACTIVE' } };
  const prisma = {
    team: { findFirst: jest.fn() },
    member: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn().mockResolvedValue([]) },
    teamFinalScore: { findFirst: jest.fn() },
  };
  const service = new StudentsService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['getStudentsGrades', () => service.getStudentsGrades('u-4')],
    ['getStudentsEvaluations', () => service.getStudentsEvaluations(1, 10, 'u-4')],
    ['getMyJudges', () => service.getMyJudges('u-4')],
  ])('%s busca el equipo de la edición activa', async (_name, call) => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: activeTeamWhere,
        orderBy: { editionId: 'desc' },
      }),
    );
  });

  it('HU-34: getStudentsGrades devuelve la nota final de la vista', async () => {
    prisma.team.findFirst.mockResolvedValue({ videogame: { id: 9 } });
    prisma.teamFinalScore.findFirst.mockResolvedValue({ finalScore: 4 });

    await expect(service.getStudentsGrades('u-4')).resolves.toEqual({ grade: 4 });
    expect(prisma.evaluation.findMany).not.toHaveBeenCalled();
  });

  it('HU-34: getStudentsGrades con la nota en proceso devuelve null', async () => {
    prisma.team.findFirst.mockResolvedValue({ videogame: { id: 9 } });
    prisma.teamFinalScore.findFirst.mockResolvedValue({ finalScore: null });

    await expect(service.getStudentsGrades('u-4')).resolves.toEqual({
      grade: null,
    });
  });

  it('getMembers solo trae los integrantes del equipo de la edición activa', async () => {
    prisma.member.findMany.mockResolvedValue([{ id: 1 }]);

    await service.getMembers('u-4');

    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { team: activeTeamWhere } }),
    );
  });
});
