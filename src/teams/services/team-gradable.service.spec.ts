import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ManualJurorAssignmentAction } from '@prisma/client';
import { TeamGradableService } from './team-gradable.service';
import { NOT_GRADABLE_RELEASE_NOTE } from '../team-gradable';

/** HU-39 (ARK-209): marcar y desmarcar un equipo como no calificable. */
describe('TeamGradableService', () => {
  const ACTIVE = { id: 4, status: 'ACTIVE' };
  const JURORS = [
    { id: 'j1', firstName: 'Ana', lastName: 'Gómez' },
    { id: 'j2', firstName: 'Luis', lastName: 'Díaz' },
  ];

  const setup = (
    team: Record<string, unknown> | null = {},
    jurors = JURORS,
  ) => {
    const tx = {
      team: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ assignedJurors: jurors }),
      },
      jurorAssignmentAuditLog: { createMany: jest.fn() },
    };
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue(
          team && {
            id: 10,
            teamCode: 'N1-ABC-101',
            teamName: 'Los Pixeles',
            isActive: true,
            editionId: 4,
            notGradable: false,
            videogame: { videogameStatus: { status: 'CONFIRMADO' } },
            ...team,
          },
        ),
      },
      edition: { findFirst: jest.fn().mockResolvedValue(ACTIVE) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const push = { notifyAssignmentChanged: jest.fn() };
    const service = new TeamGradableService(prisma as never, push as never);
    return { service, prisma, tx, push };
  };

  it('al marcarlo guarda la marca, retira a los jurados con bitácora y avisa', async () => {
    const { service, tx, push } = setup();

    const result = await service.setNotGradable(10, true, 'admin');

    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { notGradable: true },
    });
    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { assignedJurors: { set: [] } },
    });
    const { data } = tx.jurorAssignmentAuditLog.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      action: ManualJurorAssignmentAction.UNASSIGN,
      actorUserId: 'admin',
      teamId: 10,
      jurorId: 'j1',
      notes: NOT_GRADABLE_RELEASE_NOTE,
    });
    expect(push.notifyAssignmentChanged).toHaveBeenCalledWith(['j1', 'j2']);
    expect(result).toMatchObject({
      id: 10,
      notGradable: true,
      juradosRetirados: [
        { id: 'j1', nombre: 'Ana Gómez' },
        { id: 'j2', nombre: 'Luis Díaz' },
      ],
    });
    expect(result.avisoAsignacion).toContain('2 jurado(s)');
  });

  it('sin jurados asignados solo guarda la marca y no avisa', async () => {
    const { service, tx, push } = setup({}, []);
    const result = await service.setNotGradable(10, true, 'admin');
    expect(tx.jurorAssignmentAuditLog.createMany).not.toHaveBeenCalled();
    expect(push.notifyAssignmentChanged).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 10,
      teamCode: 'N1-ABC-101',
      teamName: 'Los Pixeles',
      notGradable: true,
    });
  });

  it('al quitar la marca el equipo vuelve, sin jurados que retirar', async () => {
    const { service, tx, push } = setup({ notGradable: true });
    const result = await service.setNotGradable(10, false, 'admin');
    expect(tx.team.update).toHaveBeenCalledTimes(1);
    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { notGradable: false },
    });
    expect(tx.jurorAssignmentAuditLog.createMany).not.toHaveBeenCalled();
    expect(push.notifyAssignmentChanged).not.toHaveBeenCalled();
    expect(result.notGradable).toBe(false);
  });

  it('si ya tiene ese valor no toca la base', async () => {
    const { service, prisma } = setup({ notGradable: true });
    await service.setNotGradable(10, true, 'admin');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un equipo de otra edición da 400 y no cambia', async () => {
    const { service, prisma } = setup({ editionId: 2 });
    await expect(
      service.setNotGradable(10, true, 'admin'),
    ).rejects.toMatchObject({
      response: { code: 'TEAM_NOT_IN_ACTIVE_EDITION' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin edición activa da 400', async () => {
    const { service, prisma } = setup();
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(
      service.setNotGradable(10, true, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['no existe', null],
    ['está inactivo', { isActive: false }],
  ])('un equipo que %s da 404', async (_label, team) => {
    const { service } = setup(team);
    await expect(
      service.setNotGradable(10, true, 'admin'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('solo se marcan equipos Confirmados (ARK-257, BG-57)', () => {
    const withStatus = (status: string | null) => ({
      videogame: status ? { videogameStatus: { status } } : null,
    });

    it.each([
      ['PENDIENTE', 'PENDIENTE'],
      ['RECHAZADO', 'RECHAZADO'],
      ['sin videojuego', null],
    ])(
      'marcar un equipo %s da 400 TEAM_NOT_CONFIRMED y no cambia nada',
      async (_label, status) => {
        const { service, prisma, push } = setup(withStatus(status));
        const error: unknown = await service
          .setNotGradable(10, true, 'admin')
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          statusCode: 400,
          code: 'TEAM_NOT_CONFIRMED',
          message: expect.stringContaining('Confirmado') as string,
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(push.notifyAssignmentChanged).not.toHaveBeenCalled();
      },
    );

    it('el mensaje dice el estado actual', async () => {
      const { service } = setup(withStatus('PENDIENTE'));
      await expect(
        service.setNotGradable(10, true, 'admin'),
      ).rejects.toMatchObject({
        response: { message: expect.stringContaining('PENDIENTE') as string },
      });
    });

    it('un equipo Confirmado se marca', async () => {
      const { service, tx } = setup(withStatus('CONFIRMADO'));
      await service.setNotGradable(10, true, 'admin');
      expect(tx.team.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { notGradable: true },
      });
    });

    it.each(['PENDIENTE', 'RECHAZADO'])(
      'desmarcar un equipo %s siempre se permite',
      async (status) => {
        const { service, tx } = setup({
          notGradable: true,
          ...withStatus(status),
        });
        const result = await service.setNotGradable(10, false, 'admin');
        expect(result.notGradable).toBe(false);
        expect(tx.team.update).toHaveBeenCalledWith({
          where: { id: 10 },
          data: { notGradable: false },
        });
      },
    );

    it('repetir la marca en un equipo ya marcado no falla ni cambia nada', async () => {
      const { service, prisma } = setup({
        notGradable: true,
        ...withStatus('RECHAZADO'),
      });
      const result = await service.setNotGradable(10, true, 'admin');
      expect(result.notGradable).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
