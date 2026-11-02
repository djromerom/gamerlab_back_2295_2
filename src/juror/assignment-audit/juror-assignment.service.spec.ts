import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import {
    JurorCategory,
    ManualJurorAssignmentAction,
} from '@prisma/client';
import { JurorAssignmentService } from './juror-assignment.service';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';

describe('JurorAssignmentService - manual assignment module', () => {
    let service: JurorAssignmentService;

    const actorUserId = 'actor-admin-id';

    const prismaMock = {
        user: {
            findUnique: jest.fn(),
        },
        role: {
            findFirst: jest.fn(),
        },
        team: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        evaluation: {
            findMany: jest.fn(),
        },
        jurorAssignmentAuditLog: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    const auditMock = {
        create: jest.fn(),
    };

    /** Prisma que usa la validación de HU-08 para cargar el contexto de advertencias. */
    const validationPrismaMock = {
        team: { findMany: jest.fn() },
        user: { findMany: jest.fn() },
    };

    const professorEvaluator = {
        id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
        isActive: true,
        roleId: 3,
        jurorCategory: JurorCategory.SENIOR,
        firstName: 'Profesor',
        lastName: 'Colegios',
        email: 'profesor.colegios@uninorte.edu.co',
        role: { name: 'Profesor' },
    };

    const juniorJuror = {
        id: 'c3d4e5f6-a7b8-4012-c345-567890123456',
        isActive: true,
        roleId: 4,
        jurorCategory: JurorCategory.JUNIOR,
        firstName: 'Jurado',
        lastName: 'Junior',
        email: 'jurado.junior@uninorte.edu.co',
        role: { name: 'Jurado' },
    };

    const seniorJuror = {
        id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
        isActive: true,
        roleId: 4,
        jurorCategory: JurorCategory.SENIOR,
        firstName: 'Jurado',
        lastName: 'Senior',
        email: 'jurado.senior@uninorte.edu.co',
        role: { name: 'Jurado' },
    };

    const colegioTeam = {
        id: 1,
        isActive: true,
        teamCode: 'N0-COL-01',
        editionId: 1,
        teamName: 'Equipo Colegio Dev',
        videogame: { id: 1, name: 'Juego Colegio' },
        assignedJurors: [],
    };

    const n1Team = {
        id: 2,
        isActive: true,
        teamCode: 'N1-AYP-01',
        editionId: 1,
        teamName: 'Equipo AYP Dev',
        videogame: { id: 2, name: 'Juego AYP' },
        assignedJurors: [],
    };

    beforeEach(() => {
        jest.clearAllMocks();

        validationPrismaMock.team.findMany.mockResolvedValue([]);
        validationPrismaMock.user.findMany.mockResolvedValue([]);

        service = new JurorAssignmentService(
            prismaMock as any,
            auditMock as any,
            new AssignmentValidationService(validationPrismaMock as any),
        );

        /**
         * Evitamos llamar onModuleInit en unit tests.
         * Estos IDs coinciden con el seed base:
         * Profesor = 3
         * Jurado = 4
         */
        (service as any).professorRoleId = 3;
        (service as any).jurorRoleId = 4;
    });

    it('debe asignar un SENIOR a colegios y registrar auditoría ASSIGN', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce(colegioTeam);

        const tx = {
            team: {
                update: jest.fn().mockResolvedValue({}),
                findUnique: jest.fn().mockResolvedValue({
                    id: colegioTeam.id,
                    teamName: colegioTeam.teamName,
                    videogame: colegioTeam.videogame,
                    assignedJurors: [
                        {
                            id: seniorJuror.id,
                            firstName: seniorJuror.firstName,
                            lastName: seniorJuror.lastName,
                            email: seniorJuror.email,
                        },
                    ],
                }),
            },
        };

        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );

        auditMock.create.mockResolvedValueOnce({
            id: 1,
            action: ManualJurorAssignmentAction.ASSIGN,
        });

        const result = await service.assign(
            seniorJuror.id,
            colegioTeam.id,
            actorUserId,
        );

        expect(result.message).toContain('Jurado asignado correctamente');
        expect(tx.team.update).toHaveBeenCalledWith({
            where: { id: colegioTeam.id },
            data: {
                assignedJurors: {
                    connect: {
                        id: seniorJuror.id,
                    },
                },
            },
        });

        expect(auditMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ManualJurorAssignmentAction.ASSIGN,
                actorUserId,
                teamId: colegioTeam.id,
                jurorId: seniorJuror.id,
                newJurorId: seniorJuror.id,
            }),
            tx,
        );
    });

    it('debe bloquear un JUNIOR en colegios', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(juniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce(colegioTeam);

        await expect(
            service.assign(juniorJuror.id, colegioTeam.id, actorUserId),
        ).rejects.toThrow(
            'Los jurados JUNIOR no pueden ser asignados a colegios',
        );

        expect(auditMock.create).not.toHaveBeenCalled();
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('debe permitir asignar un JUNIOR a un equipo N1', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(juniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce(n1Team);

        const tx = {
            team: {
                update: jest.fn().mockResolvedValue({}),
                findUnique: jest.fn().mockResolvedValue({
                    id: n1Team.id,
                    teamName: n1Team.teamName,
                    videogame: n1Team.videogame,
                    assignedJurors: [
                        {
                            id: juniorJuror.id,
                            firstName: juniorJuror.firstName,
                            lastName: juniorJuror.lastName,
                            email: juniorJuror.email,
                        },
                    ],
                }),
            },
        };

        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );

        auditMock.create.mockResolvedValueOnce({
            id: 2,
            action: ManualJurorAssignmentAction.ASSIGN,
        });

        const result = await service.assign(
            juniorJuror.id,
            n1Team.id,
            actorUserId,
        );

        expect(result.message).toContain('Jurado asignado correctamente');
        expect(auditMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ManualJurorAssignmentAction.ASSIGN,
                teamId: n1Team.id,
                jurorId: juniorJuror.id,
            }),
            tx,
        );
    });

    it('debe bloquear asignación duplicada', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce({
            ...colegioTeam,
            assignedJurors: [
                {
                    id: seniorJuror.id,
                    roleId: 4,
                    jurorCategory: JurorCategory.SENIOR,
                    firstName: seniorJuror.firstName,
                    lastName: seniorJuror.lastName,
                    email: seniorJuror.email,
                },
            ],
        });

        await expect(
            service.assign(seniorJuror.id, colegioTeam.id, actorUserId),
        ).rejects.toThrow(ConflictException);

        expect(auditMock.create).not.toHaveBeenCalled();
    });

    describe('HU-08: advertencias en la asignación manual', () => {
        const seniorWithThreeGroups = () =>
            validationPrismaMock.team.findMany.mockImplementation(
                async (args: any) =>
                    args.where.assignedJurors
                        ? [10, 11, 12].map((id) => ({
                              id,
                              teamCode: `N1-X-${id}`,
                              editionId: 1,
                              assignedJurors: [{ id: seniorJuror.id }],
                          }))
                        : [],
            );

        const mockSuccessfulTransaction = () => {
            const tx = {
                team: {
                    update: jest.fn().mockResolvedValue({}),
                    findUnique: jest.fn().mockResolvedValue({
                        id: n1Team.id,
                        teamName: n1Team.teamName,
                        videogame: n1Team.videogame,
                        assignedJurors: [],
                    }),
                },
            };
            prismaMock.$transaction.mockImplementationOnce(
                async (callback: any) => callback(tx),
            );
            return tx;
        };

        it('sin confirmar responde 409 ASSIGNMENT_WARNINGS y no guarda', async () => {
            seniorWithThreeGroups();
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(n1Team);

            const error = await service
                .assign(seniorJuror.id, n1Team.id, actorUserId)
                .catch((e) => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect(error.getResponse()).toMatchObject({
                code: 'ASSIGNMENT_WARNINGS',
                warnings: [expect.objectContaining({ code: 'JUROR_OVER_LIMIT' })],
            });
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
            expect(auditMock.create).not.toHaveBeenCalled();
        });

        it('con confirmWarnings guarda y deja las advertencias en la bitácora', async () => {
            seniorWithThreeGroups();
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(n1Team);
            const tx = mockSuccessfulTransaction();

            const result = await service.assign(
                seniorJuror.id,
                n1Team.id,
                actorUserId,
                true,
            );

            expect(result.advertenciasAceptadas.map((w) => w.code)).toEqual([
                'JUROR_OVER_LIMIT',
            ]);
            expect(auditMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: ManualJurorAssignmentAction.ASSIGN,
                    notes: 'Asignación manual desde módulo admin. Advertencias aceptadas: JUROR_OVER_LIMIT.',
                }),
                tx,
            );
        });

        it('confirmar no salta el bloqueo de junior en colegios', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(juniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(colegioTeam);

            await expect(
                service.assign(juniorJuror.id, colegioTeam.id, actorUserId, true),
            ).rejects.toThrow(BadRequestException);
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        it('desasignar sin confirmar avisa si el grupo queda con menos de 3', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce({
                ...n1Team,
                assignedJurors: [{ id: seniorJuror.id }],
            });

            const error = await service
                .unassign(seniorJuror.id, n1Team.id, actorUserId)
                .catch((e) => e);

            expect(error.getResponse()).toMatchObject({
                code: 'ASSIGNMENT_WARNINGS',
                warnings: [expect.objectContaining({ code: 'TEAM_UNDER_MIN' })],
            });
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });
    });

    it('debe lanzar NotFound si el evaluador no existe', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(null);

        await expect(
            service.assign('no-existe', n1Team.id, actorUserId),
        ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFound si el equipo no existe', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce(null);

        await expect(
            service.assign(seniorJuror.id, 999, actorUserId),
        ).rejects.toThrow(NotFoundException);
    });

    it('debe desasignar evaluador y registrar auditoría UNASSIGN', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce({
            ...n1Team,
            assignedJurors: [
                {
                    id: seniorJuror.id,
                    roleId: 4,
                    jurorCategory: JurorCategory.SENIOR,
                    firstName: seniorJuror.firstName,
                    lastName: seniorJuror.lastName,
                    email: seniorJuror.email,
                },
            ],
        });

        const tx = {
            team: {
                update: jest.fn().mockResolvedValue({}),
                findUnique: jest.fn().mockResolvedValue({
                    id: n1Team.id,
                    teamName: n1Team.teamName,
                    videogame: n1Team.videogame,
                    assignedJurors: [],
                }),
            },
        };

        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );

        auditMock.create.mockResolvedValueOnce({
            id: 3,
            action: ManualJurorAssignmentAction.UNASSIGN,
        });

        // El grupo queda con 0 jurados (< 3): HU-08 exige confirmar.
        const result = await service.unassign(
            seniorJuror.id,
            n1Team.id,
            actorUserId,
            true,
        );

        expect(result.message).toContain('desasignado correctamente');
        expect(result.advertenciasAceptadas.map((w) => w.code)).toEqual([
            'TEAM_UNDER_MIN',
        ]);
        expect(tx.team.update).toHaveBeenCalledWith({
            where: { id: n1Team.id },
            data: {
                assignedJurors: {
                    disconnect: {
                        id: seniorJuror.id,
                    },
                },
            },
        });

        expect(auditMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ManualJurorAssignmentAction.UNASSIGN,
                actorUserId,
                teamId: n1Team.id,
                jurorId: seniorJuror.id,
                previousJurorId: seniorJuror.id,
                notes: expect.stringContaining(
                    'Advertencias aceptadas: TEAM_UNDER_MIN',
                ),
            }),
            tx,
        );
    });

    it('debe lanzar NotFound si se intenta desasignar un evaluador que no está en el equipo', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce({
            ...n1Team,
            assignedJurors: [],
        });

        await expect(
            service.unassign(seniorJuror.id, n1Team.id, actorUserId),
        ).rejects.toThrow(NotFoundException);
    });

    it('debe reasignar evaluador y registrar auditoría REASSIGN', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce({
            ...n1Team,
            assignedJurors: [
                {
                    id: juniorJuror.id,
                    roleId: 4,
                    jurorCategory: JurorCategory.JUNIOR,
                    firstName: juniorJuror.firstName,
                    lastName: juniorJuror.lastName,
                    email: juniorJuror.email,
                },
            ],
        });

        const tx = {
            team: {
                update: jest.fn().mockResolvedValue({}),
                findUnique: jest.fn().mockResolvedValue({
                    id: n1Team.id,
                    teamName: n1Team.teamName,
                    videogame: n1Team.videogame,
                    assignedJurors: [
                        {
                            id: seniorJuror.id,
                            firstName: seniorJuror.firstName,
                            lastName: seniorJuror.lastName,
                            email: seniorJuror.email,
                        },
                    ],
                }),
            },
        };

        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );

        auditMock.create.mockResolvedValueOnce({
            id: 4,
            action: ManualJurorAssignmentAction.REASSIGN,
        });

        const result = await service.reassign(
            juniorJuror.id,
            seniorJuror.id,
            n1Team.id,
            actorUserId,
        );

        expect(result.message).toContain('reasignado correctamente');

        expect(tx.team.update).toHaveBeenCalledWith({
            where: { id: n1Team.id },
            data: {
                assignedJurors: {
                    disconnect: {
                        id: juniorJuror.id,
                    },
                },
            },
        });

        expect(tx.team.update).toHaveBeenCalledWith({
            where: { id: n1Team.id },
            data: {
                assignedJurors: {
                    connect: {
                        id: seniorJuror.id,
                    },
                },
            },
        });

        expect(auditMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ManualJurorAssignmentAction.REASSIGN,
                actorUserId,
                teamId: n1Team.id,
                jurorId: seniorJuror.id,
                previousJurorId: juniorJuror.id,
                newJurorId: seniorJuror.id,
            }),
            tx,
        );
    });

    it('debe bloquear reasignación si el jurado actual y el nuevo son el mismo', async () => {
        await expect(
            service.reassign(
                seniorJuror.id,
                seniorJuror.id,
                n1Team.id,
                actorUserId,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('debe bloquear reasignación si el jurado actual no está asignado al equipo', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce({
            ...n1Team,
            assignedJurors: [],
        });

        await expect(
            service.reassign(
                juniorJuror.id,
                seniorJuror.id,
                n1Team.id,
                actorUserId,
            ),
        ).rejects.toThrow(NotFoundException);
    });

    it('debe bloquear reasignación si el nuevo jurado ya está asignado al equipo', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findUnique.mockResolvedValueOnce({
            ...n1Team,
            assignedJurors: [
                {
                    id: juniorJuror.id,
                    roleId: 4,
                    jurorCategory: JurorCategory.JUNIOR,
                },
                {
                    id: seniorJuror.id,
                    roleId: 4,
                    jurorCategory: JurorCategory.SENIOR,
                },
            ],
        });

        await expect(
            service.reassign(
                juniorJuror.id,
                seniorJuror.id,
                n1Team.id,
                actorUserId,
            ),
        ).rejects.toThrow(ConflictException);
    });

    it('debe eliminar todas las asignaciones y registrar UNASSIGN_ALL', async () => {
        prismaMock.team.findMany.mockResolvedValueOnce([
            {
                id: colegioTeam.id,
                assignedJurors: [
                    { id: seniorJuror.id },
                    { id: professorEvaluator.id },
                ],
            },
            {
                id: n1Team.id,
                assignedJurors: [{ id: juniorJuror.id }],
            },
        ]);

        const tx = {
            team: {
                update: jest.fn().mockResolvedValue({}),
            },
        };

        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );

        auditMock.create.mockResolvedValueOnce({
            id: 5,
            action: ManualJurorAssignmentAction.UNASSIGN_ALL,
        });

        const result = await service.unassignAll(actorUserId);

        expect(result.asignacionesEliminadas).toBe(3);
        expect(tx.team.update).toHaveBeenCalledTimes(2);
        expect(auditMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ManualJurorAssignmentAction.UNASSIGN_ALL,
                actorUserId,
            }),
            tx,
        );
    });
    
    it('unassignAll también desasigna a los jurados desactivados (sin filas residuales)', async () => {
        prismaMock.team.findMany.mockResolvedValueOnce([
            { id: colegioTeam.id, assignedJurors: [{ id: 'inactivo-1' }] },
        ]);
        const tx = { team: { update: jest.fn().mockResolvedValue({}) } };
        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );
        auditMock.create.mockResolvedValueOnce({ id: 9 });

        const result = await service.unassignAll(actorUserId);

        const query = prismaMock.team.findMany.mock.calls.at(-1)[0];
        expect(query.where.assignedJurors.some).not.toHaveProperty('isActive');
        expect(query.include.assignedJurors.where).not.toHaveProperty('isActive');
        expect(result.asignacionesEliminadas).toBe(1);
        expect(tx.team.update).toHaveBeenCalledWith({
            where: { id: colegioTeam.id },
            data: { assignedJurors: { set: [] } },
        });
    });

    /*
    it('debe devolver 0 si unassignAll no encuentra asignaciones', async () => {
        prismaMock.team.findMany.mockResolvedValueOnce([]);
        
        const result = await service.unassignAll(actorUserId);
        
        expect(result.asignacionesEliminadas).toBe(0);
        expect(auditMock.create).not.toHaveBeenCalled();
    });
    */

    it('debe eliminar todas las asignaciones de un evaluador y registrar UNASSIGN_ALL_FROM_EVALUATOR', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findMany.mockResolvedValueOnce([
            { id: colegioTeam.id },
            { id: n1Team.id },
        ]);

        const tx = {
            team: {
                update: jest.fn().mockResolvedValue({}),
            },
        };

        prismaMock.$transaction.mockImplementationOnce(async (callback: any) =>
            callback(tx),
        );

        auditMock.create.mockResolvedValueOnce({
            id: 6,
            action: ManualJurorAssignmentAction.UNASSIGN_ALL_FROM_EVALUATOR,
        });

        const result = await service.unassignAllFromEvaluator(
            seniorJuror.id,
            actorUserId,
        );

        expect(result.asignacionesEliminadas).toBe(2);
        expect(tx.team.update).toHaveBeenCalledTimes(2);
        expect(auditMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                action:
                    ManualJurorAssignmentAction.UNASSIGN_ALL_FROM_EVALUATOR,
                actorUserId,
                jurorId: seniorJuror.id,
                previousJurorId: seniorJuror.id,
            }),
            tx,
        );
    });

    it('debe devolver 0 si unassignAllFromEvaluator no encuentra equipos', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
        prismaMock.team.findMany.mockResolvedValueOnce([]);

        const result = await service.unassignAllFromEvaluator(
            seniorJuror.id,
            actorUserId,
        );

        expect(result.asignacionesEliminadas).toBe(0);
        expect(auditMock.create).not.toHaveBeenCalled();
    });

    it('debe consultar el log de auditoría paginado', async () => {
        const logItem = {
            id: 1,
            action: ManualJurorAssignmentAction.ASSIGN,
            actorUserId,
            teamId: n1Team.id,
            jurorId: juniorJuror.id,
            previousJurorId: null,
            newJurorId: juniorJuror.id,
            notes: 'Asignación manual desde módulo admin.',
            createdAt: new Date(),
        };

        prismaMock.jurorAssignmentAuditLog.findMany.mockReturnValueOnce(
            Promise.resolve([logItem]),
        );
        prismaMock.jurorAssignmentAuditLog.count.mockReturnValueOnce(
            Promise.resolve(1),
        );

        prismaMock.$transaction.mockResolvedValueOnce([[logItem], 1]);

        const result = await service.getAuditLog({
            action: ManualJurorAssignmentAction.ASSIGN,
            teamId: n1Team.id,
            page: 1,
            limit: 20,
        });

        expect(result.data).toHaveLength(1);
        expect(result.metadata.totalItems).toBe(1);
        expect(result.metadata.currentPage).toBe(1);
    });

    it('debe devolver seguimiento de evaluaciones por equipo', async () => {
        prismaMock.team.findMany.mockResolvedValueOnce([
            {
                id: n1Team.id,
                teamName: n1Team.teamName,
                teamCode: n1Team.teamCode,
                videogame: n1Team.videogame,
                assignedJurors: [
                    {
                        id: juniorJuror.id,
                        firstName: juniorJuror.firstName,
                        lastName: juniorJuror.lastName,
                        email: juniorJuror.email,
                        roleId: juniorJuror.roleId,
                        jurorCategory: juniorJuror.jurorCategory,
                    },
                    {
                        id: seniorJuror.id,
                        firstName: seniorJuror.firstName,
                        lastName: seniorJuror.lastName,
                        email: seniorJuror.email,
                        roleId: seniorJuror.roleId,
                        jurorCategory: seniorJuror.jurorCategory,
                    },
                ],
            },
        ]);

        prismaMock.evaluation.findMany.mockResolvedValueOnce([
            {
                videogameId: n1Team.videogame.id,
                jurorId: juniorJuror.id,
            },
        ]);

        const result = await service.getEvaluationTracking(n1Team.id);

        expect(result).toHaveLength(1);
        expect(result[0].teamId).toBe(n1Team.id);
        expect(result[0].totalJuradosAsignados).toBe(2);
        expect(result[0].juradosQueEvaluaron).toBe(1);
        // Siempre se requieren 3 evaluaciones: pendientes = 3 - evaluaron.
        expect(result[0].juradosPendientes).toBe(2);
    });
});