import { NotFoundException } from '@nestjs/common';
import { JurorAssignmentService } from './juror-assignment.service';

/**
 * ARK-132 (BG-19): GET /juror/evaluation-tracking alimenta la pantalla Asignación de jurados.
 * Solo debe listar equipos de la edición activa (o de la pedida con ?editionId=).
 */
describe('JurorAssignmentService.getEvaluationTracking por edición (ARK-132)', () => {
  const prisma = {
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    team: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
  };
  let service: JurorAssignmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.team.findMany.mockResolvedValue([]);
    prisma.evaluation.findMany.mockResolvedValue([]);
    service = new JurorAssignmentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
      { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
    );
    (service as any).professorRoleId = 3;
    (service as any).jurorRoleId = 4;
  });

  it('sin editionId filtra los equipos por la edición activa', async () => {
    prisma.edition.findFirst.mockResolvedValue({ id: 5, title: 'Feria 5', status: 'ACTIVE' });

    await service.getEvaluationTracking();

    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, editionId: 5 }),
      }),
    );
  });

  it('con editionId consulta esa edición (historial)', async () => {
    prisma.edition.findUnique.mockResolvedValue({ id: 4, title: 'Feria 4', status: 'INACTIVE' });

    await service.getEvaluationTracking(undefined, undefined, 4);

    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ editionId: 4 }) }),
    );
    expect(prisma.edition.findFirst).not.toHaveBeenCalled();
  });

  it('una edición que no existe responde 404, no 500', async () => {
    prisma.edition.findUnique.mockResolvedValue(null);

    await expect(service.getEvaluationTracking(undefined, undefined, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it('sin edición activa devuelve lista vacía sin consultar equipos', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);

    await expect(service.getEvaluationTracking()).resolves.toEqual([]);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it('sin edición activa, pedir un equipo concreto responde 404', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);

    await expect(service.getEvaluationTracking(12)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ARK-140 (BG-25): la pantalla mostraba «Sin líder» porque esta respuesta no lo traía
  it('cada equipo trae su líder (team.userId)', async () => {
    prisma.edition.findFirst.mockResolvedValue({ id: 5, title: 'Feria 5', status: 'ACTIVE' });
    prisma.team.findMany.mockResolvedValue([
      {
        id: 7,
        teamName: 'Equipo 7',
        teamCode: 'N1-07',
        videogame: { id: 70, name: 'Juego 7' },
        user: { id: 'lider-7', firstName: 'Ana', lastName: 'Gómez', email: 'ana@uninorte.edu.co' },
        assignedJurors: [],
      },
    ]);

    const [team] = await service.getEvaluationTracking();

    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        }),
      }),
    );
    expect(team.lider).toEqual({
      id: 'lider-7',
      nombre: 'Ana Gómez',
      email: 'ana@uninorte.edu.co',
    });
  });
});
