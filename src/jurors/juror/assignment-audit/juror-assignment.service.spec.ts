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
            // ARK-131: participación en la edición activa (jurorsOfEdition)
            findFirst: jest.fn(),
            // ARK-262: nombres del historial de cambios
            findMany: jest.fn(),
        },
        edition: {
            findFirst: jest.fn(),
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
        edition: { status: 'ACTIVE', title: 'Edición 1' },
        videogame: { id: 1, name: 'Juego Colegio', videogameStatus: { status: 'CONFIRMADO' } },
        assignedJurors: [],
    };

    const n1Team = {
        id: 2,
        isActive: true,
        teamCode: 'N1-AYP-01',
        editionId: 1,
        teamName: 'Equipo AYP Dev',
        edition: { status: 'ACTIVE', title: 'Edición 1' },
        videogame: { id: 2, name: 'Juego AYP', videogameStatus: { status: 'CONFIRMADO' } },
        assignedJurors: [],
    };

    const activeEdition = {
        id: 1,
        title: 'Edición 1',
        status: 'ACTIVE',
        year: 2026,
        semester: 2,
        endsAt: null,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        validationPrismaMock.team.findMany.mockResolvedValue([]);
        validationPrismaMock.user.findMany.mockResolvedValue([]);
        // Por defecto: la edición 1 es la activa y el evaluador participa en ella.
        prismaMock.edition.findFirst.mockResolvedValue(activeEdition);
        prismaMock.user.findFirst.mockImplementation(({ where }) =>
            Promise.resolve({ id: where.id.in[0] }),
        );

        service = new JurorAssignmentService(
            prismaMock as any,
            auditMock as any,
            new AssignmentValidationService(validationPrismaMock as any),
            { notifyAssignmentChanged: jest.fn(), notifyTeamsAssigned: jest.fn() } as any,
            // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
            { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
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

    it.each(['PENDIENTE', 'RECHAZADO'])(
        'BG-35: no asigna a un equipo %s y no escribe nada',
        async (status) => {
            prismaMock.user.findUnique.mockResolvedValueOnce(juniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce({
                ...n1Team,
                videogame: { ...n1Team.videogame, videogameStatus: { status } },
            });

            await expect(
                service.assign(juniorJuror.id, n1Team.id, actorUserId),
            ).rejects.toMatchObject({
                response: expect.objectContaining({ code: 'TEAM_NOT_CONFIRMED', teamId: n1Team.id }),
            });

            expect(auditMock.create).not.toHaveBeenCalled();
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        },
    );

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

        prismaMock.user.findMany.mockResolvedValueOnce([
            { id: actorUserId, firstName: 'Admin', lastName: 'Romero' },
            { id: juniorJuror.id, firstName: 'Jurado', lastName: 'Junior' },
        ]);
        prismaMock.team.findMany.mockResolvedValueOnce([
            {
                id: n1Team.id,
                teamName: n1Team.teamName,
                teamCode: n1Team.teamCode,
                videogame: { name: 'Juego N1' },
            },
        ]);

        const result = await service.getAuditLog({
            action: ManualJurorAssignmentAction.ASSIGN,
            teamId: n1Team.id,
            page: 1,
            limit: 20,
        });

        expect(result.data).toHaveLength(1);
        expect(result.metadata.totalItems).toBe(1);
        expect(result.metadata.currentPage).toBe(1);
        // ARK-262: nombres en vez de ids
        expect(result.data[0]).toMatchObject({
            id: 1,
            actorName: 'Admin Romero',
            jurorName: 'Jurado Junior',
            newJurorName: 'Jurado Junior',
            previousJurorName: null,
            teamName: n1Team.teamName,
            teamCode: n1Team.teamCode,
            gameName: 'Juego N1',
        });
    });

    it('ARK-262: el historial se ordena por fecha y por id, para que las páginas no repitan ni salten registros', async () => {
        prismaMock.jurorAssignmentAuditLog.findMany.mockReturnValueOnce(
            Promise.resolve([]),
        );
        prismaMock.jurorAssignmentAuditLog.count.mockReturnValueOnce(
            Promise.resolve(0),
        );
        prismaMock.$transaction.mockResolvedValueOnce([[], 0]);

        await service.getAuditLog({ page: 2, limit: 50 });

        expect(prismaMock.jurorAssignmentAuditLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                skip: 50,
                take: 50,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            }),
        );
        // Sin registros no se consulta nada más
        expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('debe devolver seguimiento de evaluaciones por equipo', async () => {
        // ARK-132: el seguimiento se limita a la edición activa
        (prismaMock as any).edition ??= { findFirst: jest.fn() };
        (prismaMock as any).edition.findFirst.mockResolvedValueOnce({
            id: 1,
            title: 'Edición 1',
            status: 'ACTIVE',
        });
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

    describe('ARK-130 (HU-27): solo equipos de la edición activa', () => {
        const pastTeam = {
            ...n1Team,
            editionId: 4,
            edition: { status: 'INACTIVE', title: 'Feria 4' },
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
        };

        it('asignar a un equipo de una edición anterior responde 400 y no guarda', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(pastTeam);
            await expect(
                service.assign(seniorJuror.id, n1Team.id, actorUserId),
            ).rejects.toThrow(/Feria 4.*solo lectura/);
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        it('reasignar y quitar también se rechazan', async () => {
            prismaMock.user.findUnique.mockResolvedValue(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValue(pastTeam);
            await expect(
                service.reassign(juniorJuror.id, seniorJuror.id, n1Team.id, actorUserId),
            ).rejects.toThrow(BadRequestException);
            await expect(
                service.unassign(juniorJuror.id, n1Team.id, actorUserId),
            ).rejects.toThrow(BadRequestException);
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });
    });
    describe('ARK-131 (BG-18): equipo y evaluador de la edición activa', () => {
        const edition5 = { ...activeEdition, id: 5, title: 'Feria 5' };
        const team4 = {
            ...n1Team,
            editionId: 4,
            edition: { status: 'INACTIVE', title: 'Feria 4' },
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
        };
        const team5 = {
            ...n1Team,
            editionId: 5,
            edition: { status: 'ACTIVE', title: 'Feria 5' },
        };

        const txReturning = (team: any) => ({
            team: {
                update: jest.fn().mockResolvedValue({}),
                findUnique: jest.fn().mockResolvedValue({
                    id: team.id,
                    teamName: team.teamName,
                    videogame: team.videogame,
                    assignedJurors: [],
                }),
            },
        });

        beforeEach(() => {
            prismaMock.edition.findFirst.mockResolvedValue(edition5);
        });

        const expectEditionReadOnly = async (promise: Promise<unknown>) => {
            const error: any = await promise.catch((e) => e);
            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.getResponse()).toMatchObject({
                statusCode: 400,
                code: 'EDITION_READ_ONLY',
                blocker: 'TEAM_NOT_IN_ACTIVE_EDITION',
                teamId: team4.id,
            });
            expect(error.message).toMatch(/N1-AYP-01.*«Feria 4».*solo lectura/);
        };

        it('asignar a un equipo de la edición 4 con la 5 activa responde 400 y no guarda', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(team4);
            await expectEditionReadOnly(
                service.assign(seniorJuror.id, team4.id, actorUserId),
            );
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        it('reasignar y quitar en un equipo de la edición 4 también responden 400', async () => {
            prismaMock.user.findUnique.mockResolvedValue(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValue(team4);
            await expectEditionReadOnly(
                service.reassign(juniorJuror.id, seniorJuror.id, team4.id, actorUserId),
            );
            await expectEditionReadOnly(
                service.unassign(juniorJuror.id, team4.id, actorUserId),
            );
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        it('asignar a un equipo de la edición 5 (activa) guarda', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(team5);
            const tx = txReturning(team5);
            prismaMock.$transaction.mockImplementation(async (cb) => cb(tx));

            const result = await service.assign(seniorJuror.id, team5.id, actorUserId);

            expect(result.message).toBe('Jurado asignado correctamente al equipo.');
            expect(tx.team.update).toHaveBeenCalled();
            // La participación se consulta con la definición única de HU-25 sobre la edición activa
            const [{ where }] = prismaMock.user.findFirst.mock.calls[0];
            expect(where.id).toEqual({ in: [seniorJuror.id] });
            expect(JSON.stringify(where)).toContain('"editionId":5');
        });

        it('un evaluador que no participa en la edición activa no se puede asignar', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce(team5);
            prismaMock.user.findFirst.mockResolvedValueOnce(null);

            const error = await service
                .assign(seniorJuror.id, team5.id, actorUserId)
                .catch((e) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.getResponse()).toMatchObject({
                code: 'EVALUATOR_NOT_IN_EDITION',
                blocker: 'EVALUATOR_NOT_IN_EDITION',
                jurorId: seniorJuror.id,
            });
            expect(error.message).toMatch(/no participa en «Feria 5»/);
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        it('reasignar a un evaluador que no participa responde 400', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(seniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce({
                ...team5,
                assignedJurors: team4.assignedJurors,
            });
            prismaMock.user.findFirst.mockResolvedValueOnce(null);

            await expect(
                service.reassign(juniorJuror.id, seniorJuror.id, team5.id, actorUserId),
            ).rejects.toThrow(/no participa/);
            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        it('quitar a un evaluador que ya no participa sí se permite', async () => {
            prismaMock.user.findUnique.mockResolvedValueOnce(juniorJuror);
            prismaMock.team.findUnique.mockResolvedValueOnce({
                ...team5,
                assignedJurors: team4.assignedJurors,
            });
            prismaMock.user.findFirst.mockResolvedValue(null);
            const tx = txReturning(team5);
            prismaMock.$transaction.mockImplementation(async (cb) => cb(tx));

            const result = await service.unassign(
                juniorJuror.id,
                team5.id,
                actorUserId,
                true,
            );

            expect(result.message).toBe('Evaluador desasignado correctamente del equipo.');
            expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
        });

        it('sin edición activa responde 404 NO_ACTIVE_EDITION', async () => {
            prismaMock.edition.findFirst.mockResolvedValue(null);
            const error = await service
                .assign(seniorJuror.id, team5.id, actorUserId)
                .catch((e) => e);
            expect(error).toBeInstanceOf(NotFoundException);
            expect(error.getResponse()).toMatchObject({ code: 'NO_ACTIVE_EDITION' });
        });
    });
});
