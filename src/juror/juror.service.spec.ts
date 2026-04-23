import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JurorService } from './juror.service';

describe('JurorService - manual assignment module', () => {
  let service: JurorService;

  const prismaMock = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
    videogameStatus: {
      findUnique: jest.fn(),
    },
    team: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    evaluation: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    jurorAssignmentAuditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const authMock = {
    registerUser: jest.fn(),
    invalidateUserProfileCache: jest.fn(),
  };

  const auditMock = {
    create: jest.fn(),
  };

  const seniorProfessor = {
    id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
    isActive: true,
    roleId: 3,
    jurorCategory: 'SENIOR',
    role: { name: 'Profesor' },
  };

  const juniorJuror = {
    id: 'c3d4e5f6-a7b8-4012-c345-567890123456',
    isActive: true,
    roleId: 4,
    jurorCategory: 'JUNIOR',
    role: { name: 'Jurado' },
  };

  const seniorJuror = {
    id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
    isActive: true,
    roleId: 4,
    jurorCategory: 'SENIOR',
    role: { name: 'Jurado' },
  };

  const colegioTeam = {
    id: 1,
    isActive: true,
    teamCode: 'N0-COL-01',
    teamName: 'Team Colegios Demo',
    videogame: { id: 1, name: 'Game Colegios Demo' },
    assignedJurors: [],
  };

  const updatedTeamResponse = {
    id: 1,
    teamName: 'Team Colegios Demo',
    videogame: { id: 1, name: 'Game Colegios Demo' },
    assignedJurors: [
      {
        id: seniorProfessor.id,
        firstName: 'Profesor',
        lastName: 'Colegios',
        email: 'profesorcolegios@uninorte.edu.co',
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();

    service = new JurorService(
      authMock as any,
      prismaMock as any,
      auditMock as any,
    );

    (service as any).jurorRoleId = 4;
    (service as any).professorRoleId = 3;
    (service as any).confirmedStatusId = 1;

    (service as any).validateEvaluatorCategoryForLevel = jest.fn(
      (evaluator: any, teamLevel: number) => {
        if (evaluator.roleId === 3 && teamLevel !== 0) {
          throw new BadRequestException(
            'Los profesores solo pueden ser asignados a equipos de nivel 0 (colegios)',
          );
        }

        if (evaluator.roleId === 4) {
          if (!evaluator.jurorCategory) {
            throw new BadRequestException(
              'El jurado no tiene categoría asignada (JUNIOR/SENIOR)',
            );
          }

          if (teamLevel === 0 && evaluator.jurorCategory === 'JUNIOR') {
            throw new BadRequestException(
              'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0)',
            );
          }
        }
      },
    );

    (service as any).getEvaluatorLabel = jest.fn((evaluator: any) => {
      if (evaluator.roleId === 3) return 'profesor';
      if (evaluator.roleId === 4 && evaluator.jurorCategory) {
        return `jurado ${String(evaluator.jurorCategory).toLowerCase()}`;
      }
      return 'evaluador';
    });
  });

  it('debe asignar un SENIOR a colegios y registrar auditoría ASSIGN', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(seniorProfessor);
    prismaMock.team.findUnique.mockResolvedValueOnce(colegioTeam);
    prismaMock.team.findMany.mockResolvedValueOnce([]);
    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        team: {
          findUnique: jest.fn().mockResolvedValue(updatedTeamResponse),
        },
      };
      return cb(tx);
    });
    auditMock.create.mockResolvedValueOnce({ id: 1, action: 'ASSIGN' });

    const result = await service.assignJurorToTeam(
      seniorProfessor.id,
      1,
      'actor-admin-id',
    );

    expect(result.message).toContain('Jurado asignado correctamente');
    expect(auditMock.create).toHaveBeenCalled();
    console.log('✅ ASSIGN ok:', result.message);
  });

  it('debe bloquear un JUNIOR en colegios', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(juniorJuror);
    prismaMock.team.findUnique.mockResolvedValueOnce(colegioTeam);

    await expect(
      service.assignJurorToTeam(juniorJuror.id, 1, 'actor-admin-id'),
    ).rejects.toThrow(
      'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0)',
    );

    console.log('✅ JUNIOR bloqueado correctamente en colegios');
  });

  it('debe bloquear asignación duplicada', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(seniorProfessor);
    prismaMock.team.findUnique.mockResolvedValueOnce({
      ...colegioTeam,
      assignedJurors: [{ id: seniorProfessor.id }],
    });

    await expect(
      service.assignJurorToTeam(seniorProfessor.id, 1, 'actor-admin-id'),
    ).rejects.toThrow(ConflictException);

    console.log('✅ duplicado bloqueado correctamente');
  });

  it('debe desasignar evaluador y registrar auditoría UNASSIGN', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(seniorProfessor);
    prismaMock.team.findUnique.mockResolvedValueOnce({
      ...colegioTeam,
      assignedJurors: [{ id: seniorProfessor.id }],
    });

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        team: {
          update: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            teamName: 'Team Colegios Demo',
            videogame: { id: 1, name: 'Game Colegios Demo' },
            assignedJurors: [],
          }),
        },
      };
      return cb(tx);
    });

    auditMock.create.mockResolvedValueOnce({ id: 2, action: 'UNASSIGN' });

    const result = await service.removeJurorFromTeam(
      seniorProfessor.id,
      1,
      'actor-admin-id',
    );

    expect(result.message).toContain('desasignado correctamente');
    expect(auditMock.create).toHaveBeenCalled();
    console.log('✅ UNASSIGN ok:', result.message);
  });

  it('debe reasignar evaluador y registrar auditoría REASSIGN', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);

    prismaMock.team.findUnique.mockResolvedValueOnce({
      ...colegioTeam,
      assignedJurors: [{ id: seniorProfessor.id, roleId: 3 }],
      videogame: { id: 1, name: 'Game Colegios Demo' },
    });

    prismaMock.team.findMany.mockResolvedValueOnce([]);

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        team: {
          update: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            teamName: 'Team Colegios Demo',
            videogame: { id: 1, name: 'Game Colegios Demo' },
            assignedJurors: [
              {
                id: seniorJuror.id,
                firstName: 'Jurado',
                lastName: 'Senior 1',
                email: 'juradosenior1@uninorte.edu.co',
              },
            ],
          }),
        },
      };
      return cb(tx);
    });

    auditMock.create.mockResolvedValueOnce({ id: 3, action: 'REASSIGN' });

    const result = await service.reassignJurorOnTeam(
      seniorProfessor.id,
      seniorJuror.id,
      1,
      'actor-admin-id',
    );

    expect(result.message).toContain('reasignado correctamente');
    expect(auditMock.create).toHaveBeenCalled();
    console.log('✅ REASSIGN ok:', result.message);
  });

  it('debe eliminar todas las asignaciones y registrar UNASSIGN_ALL', async () => {
    prismaMock.team.findMany.mockResolvedValueOnce([
      {
        id: 1,
        assignedJurors: [{ id: seniorProfessor.id }],
      },
    ]);

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        team: {
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    });

    auditMock.create.mockResolvedValueOnce({ id: 4, action: 'UNASSIGN_ALL' });

    const result = await service.removeAllJurorAssignments('actor-admin-id');

    expect(result.asignacionesEliminadas).toBe(1);
    expect(auditMock.create).toHaveBeenCalled();
    console.log('✅ UNASSIGN_ALL ok:', result);
  });

  it('debe eliminar todas las asignaciones de un evaluador y registrar UNASSIGN_ALL_FROM_EVALUATOR', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: seniorProfessor.id,
      isActive: true,
      roleId: 3,
      firstName: 'Profesor',
      lastName: 'Colegios',
      email: 'profesorcolegios@uninorte.edu.co',
      teamsToEvaluate: [{ id: 1 }],
      role: { name: 'Profesor' },
    });

    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        team: {
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    });

    auditMock.create.mockResolvedValueOnce({
      id: 5,
      action: 'UNASSIGN_ALL_FROM_EVALUATOR',
    });

    const result = await service.removeAllAssignmentsFromJuror(
      seniorProfessor.id,
      'actor-admin-id',
    );

    expect(result.asignacionesEliminadas).toBe(1);
    expect(auditMock.create).toHaveBeenCalled();
    console.log('✅ UNASSIGN_ALL_FROM_EVALUATOR ok:', result);
  });

  it('debe devolver 0 si removeAllJurorAssignments no encuentra asignaciones', async () => {
    prismaMock.team.findMany.mockResolvedValueOnce([]);

    const result = await service.removeAllJurorAssignments('actor-admin-id');

    expect(result.asignacionesEliminadas).toBe(0);
    console.log('✅ removeAllJurorAssignments sin datos ok');
  });

  it('debe devolver 0 si removeAllAssignmentsFromJuror no encuentra equipos', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: seniorProfessor.id,
      isActive: true,
      roleId: 3,
      firstName: 'Profesor',
      lastName: 'Colegios',
      email: 'profesorcolegios@uninorte.edu.co',
      teamsToEvaluate: [],
      role: { name: 'Profesor' },
    });

    const result = await service.removeAllAssignmentsFromJuror(
      seniorProfessor.id,
      'actor-admin-id',
    );

    expect(result.asignacionesEliminadas).toBe(0);
    console.log('✅ removeAllAssignmentsFromJuror sin datos ok');
  });

  it('debe lanzar NotFound si el evaluador no existe al desasignar', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.removeJurorFromTeam('no-existe', 1, 'actor-admin-id'),
    ).rejects.toThrow(NotFoundException);

    console.log('✅ NotFound en removeJurorFromTeam ok');
  });
});