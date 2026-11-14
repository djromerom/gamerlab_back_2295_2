import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ManualJurorAssignmentAction } from '@prisma/client';
import { JurorAssignmentService } from './juror-assignment.service';

/**
 * ARK-133 (BG-20): «quitar todas las asignaciones» y «quitar todas las de un jurado» solo tocan
 * equipos de la edición activa. Las de ediciones anteriores son historial y quedan intactas.
 */
describe('JurorAssignmentService: quitar todas solo en la edición activa (ARK-133)', () => {
  const actorUserId = 'admin-1';
  const edition5 = { id: 5, title: 'Feria 5', status: 'ACTIVE' };

  const prisma = {
    edition: { findFirst: jest.fn() },
    team: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { create: jest.fn() };
  const tx = { team: { update: jest.fn() } };
  let service: JurorAssignmentService;

  const senior = {
    id: 'juror-1',
    isActive: true,
    roleId: 4,
    firstName: 'Ana',
    lastName: 'Senior',
    email: 'ana@uninorte.edu.co',
    role: { name: 'Jurado' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.edition.findFirst.mockResolvedValue(edition5);
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
    tx.team.update.mockResolvedValue({});
    audit.create.mockResolvedValue({ id: 1 });
    service = new JurorAssignmentService(
      prisma as any,
      audit as any,
      {} as any,
      { notifyAssignmentChanged: jest.fn() } as any,
      // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
      { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
    );
    (service as any).professorRoleId = 3;
    (service as any).jurorRoleId = 4;
  });

  describe('unassignAll', () => {
    it('solo busca equipos de la edición activa', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 51, assignedJurors: [{ id: 'a' }, { id: 'b' }] },
        { id: 52, assignedJurors: [{ id: 'c' }] },
      ]);

      await service.unassignAll(actorUserId);

      const query = prisma.team.findMany.mock.calls[0][0];
      expect(query.where).toMatchObject({ isActive: true, editionId: 5 });
      // Solo se vacían los equipos devueltos (los de la 5); los de la 4 ni se consultan
      expect(tx.team.update.mock.calls.map((c) => c[0].where.id)).toEqual([51, 52]);
    });

    it('responde la edición, las asignaciones y los equipos afectados', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 51, assignedJurors: [{ id: 'a' }, { id: 'b' }] },
        { id: 52, assignedJurors: [{ id: 'c' }] },
      ]);

      const result = await service.unassignAll(actorUserId);

      expect(result).toEqual({
        message: 'Se eliminaron 3 asignaciones de evaluadores en 2 equipos de «Feria 5».',
        asignacionesEliminadas: 3,
        equiposAfectados: 2,
        edicion: { id: 5, title: 'Feria 5' },
      });
    });

    it('la bitácora anota la edición y la cantidad', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 51, assignedJurors: [{ id: 'a' }, { id: 'b' }] },
      ]);

      await service.unassignAll(actorUserId);

      expect(audit.create).toHaveBeenCalledWith(
        {
          action: ManualJurorAssignmentAction.UNASSIGN_ALL,
          actorUserId,
          notes:
            'Edición «Feria 5» (id 5): se eliminaron manualmente 2 asignaciones de evaluadores en 1 equipo.',
        },
        tx,
      );
    });

    it('sin asignaciones en la activa responde 400 (antes llegaba como 500)', async () => {
      prisma.team.findMany.mockResolvedValue([]);

      const error = await service.unassignAll(actorUserId).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('Feria 5');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sin edición activa responde 404 NO_ACTIVE_EDITION y no borra nada', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      const error = await service.unassignAll(actorUserId).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toMatchObject({ code: 'NO_ACTIVE_EDITION' });
      expect(prisma.team.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('unassignAllFromEvaluator', () => {
    beforeEach(() => prisma.user.findUnique.mockResolvedValue(senior));

    it('solo quita al evaluador de los equipos de la edición activa', async () => {
      prisma.team.findMany.mockResolvedValue([{ id: 51 }, { id: 52 }]);

      const result = await service.unassignAllFromEvaluator(senior.id, actorUserId);

      const query = prisma.team.findMany.mock.calls[0][0];
      expect(query.where).toMatchObject({
        isActive: true,
        editionId: 5,
        assignedJurors: { some: { id: senior.id } },
      });
      expect(tx.team.update).toHaveBeenCalledTimes(2);
      expect(tx.team.update).toHaveBeenCalledWith({
        where: { id: 51 },
        data: { assignedJurors: { disconnect: { id: senior.id } } },
      });
      expect(result).toMatchObject({
        asignacionesEliminadas: 2,
        edicion: { id: 5, title: 'Feria 5' },
        evaluador: { id: senior.id, nombre: 'Ana Senior', email: senior.email },
      });
      expect(result.message).toContain('Feria 5');
    });

    it('la bitácora anota la edición y la cantidad', async () => {
      prisma.team.findMany.mockResolvedValue([{ id: 51 }]);

      await service.unassignAllFromEvaluator(senior.id, actorUserId);

      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ManualJurorAssignmentAction.UNASSIGN_ALL_FROM_EVALUATOR,
          jurorId: senior.id,
          notes: `Edición «Feria 5» (id 5): se eliminó 1 asignación del evaluador ${senior.id}.`,
        }),
        tx,
      );
    });

    it('sin equipos en la activa devuelve 0 con la edición y no escribe', async () => {
      prisma.team.findMany.mockResolvedValue([]);

      const result = await service.unassignAllFromEvaluator(senior.id, actorUserId);

      expect(result).toMatchObject({ asignacionesEliminadas: 0, edicion: { id: 5 } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.create).not.toHaveBeenCalled();
    });

    it('sin edición activa responde 404 NO_ACTIVE_EDITION', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      const error = await service
        .unassignAllFromEvaluator(senior.id, actorUserId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toMatchObject({ code: 'NO_ACTIVE_EDITION' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
