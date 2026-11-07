import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  EditionStatus,
  JurorCategory,
  JurorType,
  ManualJurorAssignmentAction,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentPushNotifier } from '../../push-notifications/assignment-push-notifier.service';
import {
  EDITION_READ_ONLY,
  NO_ACTIVE_EDITION,
} from '../../editions/active-edition';
import { jurorsOfEdition } from '../../juror-edition/jurors-of-edition';
import {
  AUTO_ASSIGNMENT_AUDIT_NOTE,
  AUTO_ASSIGNMENT_OUTDATED_CODE,
  AutomaticAssignmentService,
} from './automatic-assignment.service';

const ACTIVE = {
  id: 5,
  title: 'Feria 2026-2',
  status: EditionStatus.ACTIVE,
  year: 2026,
  semester: 20,
  endsAt: new Date('2026-11-27T00:00:00Z'),
};

const role = (name: string) => ({ name });

function dbUser(
  id: string,
  roleName: 'Jurado' | 'Profesor',
  extra: {
    jurorCategory?: JurorCategory | null;
    type?: JurorType;
    nrcs?: number[];
  } = {},
) {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    jurorCategory: extra.jurorCategory ?? null,
    role: role(roleName),
    managedNrcs: (extra.nrcs ?? []).map((nrcId) => ({ id: nrcId })),
    jurorEditions: extra.type ? [{ type: extra.type }] : [],
  };
}

function dbTeam(
  id: number,
  teamCode: string,
  extra: { confirmed?: boolean; assigned?: ReturnType<typeof dbUser>[] } = {},
) {
  return {
    id,
    teamCode,
    teamName: `Equipo ${id}`,
    videogame: {
      videogameStatus: {
        status: extra.confirmed === false ? 'PENDIENTE' : 'CONFIRMADO',
      },
    },
    assignedJurors: extra.assigned ?? [],
    members: [{ nrcs: [] }],
  };
}

interface TxMock {
  team: { findMany: jest.Mock; update: jest.Mock };
  user: { findMany: jest.Mock };
  jurorAssignmentAuditLog: { createMany: jest.Mock };
}

interface PrismaMock extends TxMock {
  edition: { findFirst: jest.Mock; findUnique: jest.Mock };
  $transaction: jest.Mock;
}

/** Primer argumento de cada llamada a un mock, tipado. */
const callArgs = <T>(mock: jest.Mock): T[] =>
  (mock.mock.calls as unknown[][]).map((call) => call[0] as T);

type TeamUpdateArg = { data: { assignedJurors: Record<string, unknown> } };
type CreateManyArg = { data: unknown[] };

describe('AutomaticAssignmentService (HU-07)', () => {
  let prisma: PrismaMock;
  let tx: TxMock;
  let service: AutomaticAssignmentService;
  let pushNotifier: { notifyAssignmentChanged: jest.Mock };

  const teams = [dbTeam(1, 'N1-A-01'), dbTeam(2, 'N1-A-02')];
  const users = [
    dbUser('prof', 'Profesor'),
    dbUser('j1', 'Jurado', { jurorCategory: JurorCategory.JUNIOR }),
    dbUser('j2', 'Jurado', { jurorCategory: JurorCategory.JUNIOR }),
    dbUser('j3', 'Jurado', { jurorCategory: JurorCategory.JUNIOR }),
    dbUser('backup', 'Jurado', {
      jurorCategory: JurorCategory.SENIOR,
      type: JurorType.BACKUP,
    }),
  ];

  beforeEach(() => {
    tx = {
      team: {
        findMany: jest.fn().mockResolvedValue(teams),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue(users) },
      jurorAssignmentAuditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma = {
      ...tx,
      edition: {
        findFirst: jest.fn().mockResolvedValue(ACTIVE),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...ACTIVE, id: 4, status: 'ARCHIVED' }),
      },
      $transaction: jest.fn((fn: (client: TxMock) => unknown) => fn(tx)),
    };
    pushNotifier = { notifyAssignmentChanged: jest.fn() };
    service = new AutomaticAssignmentService(
      prisma as unknown as PrismaService,
      pushNotifier as unknown as AssignmentPushNotifier,
    );
  });

  describe('preview', () => {
    it('usa la edición activa, los jurados de la edición y no guarda nada', async () => {
      const result = await service.preview({});

      expect(prisma.edition.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: EditionStatus.ACTIVE } }),
      );
      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { editionId: 5, isActive: true },
        }),
      );
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: jurorsOfEdition(5) }),
      );
      expect(result.edition).toMatchObject({
        id: 5,
        title: 'Feria 2026-2',
        status: EditionStatus.ACTIVE,
      });
      expect(result.summary.newAssignments).toBe(6);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.team.update).not.toHaveBeenCalled();
    });

    it('deja fuera a los remanentes (tipo BACKUP en la edición)', async () => {
      const result = await service.preview({});

      expect(result.backupJurorsExcluded).toBe(1);
      expect(result.assignments.map((a) => a.jurorId)).not.toContain('backup');
      expect(result.jurors.map((j) => j.id)).not.toContain('backup');
    });

    it('aplica maxTeamsPerJuror (por defecto 3)', async () => {
      const byDefault = await service.preview({});
      const limited = await service.preview({ maxTeamsPerJuror: 1 });

      expect(byDefault.limits).toEqual({
        maxTeamsPerJuror: 3,
        jurorsPerTeam: 3,
      });
      expect(limited.limits.maxTeamsPerJuror).toBe(1);
      expect(Math.max(...limited.jurors.map((j) => j.teamsAfter))).toBe(1);
    });

    it('con editionId simula sobre esa edición', async () => {
      const result = await service.preview({ editionId: 4 });

      expect(prisma.edition.findUnique).toHaveBeenCalled();
      expect(result.edition.id).toBe(4);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: jurorsOfEdition(4) }),
      );
    });

    it('400 si no hay equipos confirmados', async () => {
      prisma.team.findMany.mockResolvedValue([
        dbTeam(1, 'N1-A-01', { confirmed: false }),
      ]);

      await expect(service.preview({})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('400 si la edición no tiene jurados oficiales', async () => {
      prisma.user.findMany.mockResolvedValue([users[4]]);

      await expect(service.preview({})).rejects.toThrow(
        /Jurados de la edición/,
      );
    });

    it('404 si no hay edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(service.preview({})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('confirm', () => {
    it('guarda el plan de la vista previa en una transacción, con bitácora', async () => {
      const { assignments } = await service.preview({});

      const result = await service.confirm({ assignments }, 'admin-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.team.update).toHaveBeenCalledTimes(2);
      for (const arg of callArgs<TeamUpdateArg>(tx.team.update)) {
        expect(arg.data.assignedJurors).toHaveProperty('connect');
        expect(arg.data.assignedJurors).not.toHaveProperty('set');
      }
      expect(tx.jurorAssignmentAuditLog.createMany).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- matcher de jest
        data: expect.arrayContaining([
          expect.objectContaining({
            action: ManualJurorAssignmentAction.ASSIGN,
            actorUserId: 'admin-1',
            notes: AUTO_ASSIGNMENT_AUDIT_NOTE,
          }),
        ]),
      });
      expect(
        callArgs<CreateManyArg>(tx.jurorAssignmentAuditLog.createMany)[0].data,
      ).toHaveLength(6);
      expect(result.saved).toBe(6);
      expect(result.teamsUpdated).toBe(2);
    });

    it('HU-37: avisa una sola vez a la lista de jurados, después de guardar', async () => {
      const { assignments } = await service.preview({});

      await service.confirm({ assignments }, 'admin-1');

      expect(pushNotifier.notifyAssignmentChanged).toHaveBeenCalledTimes(1);
      expect(pushNotifier.notifyAssignmentChanged).toHaveBeenCalledWith(
        assignments.map((assignment) => assignment.jurorId),
      );
      expect(
        pushNotifier.notifyAssignmentChanged.mock.invocationCallOrder[0],
      ).toBeGreaterThan(prisma.$transaction.mock.invocationCallOrder[0]);
    });

    it('HU-37: no avisa si el plan cambió ni si la transacción se revierte', async () => {
      const { assignments } = await service.preview({});

      await expect(
        service.confirm({ assignments: assignments.slice(1) }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      tx.jurorAssignmentAuditLog.createMany.mockRejectedValue(
        new Error('db caída'),
      );
      await expect(
        service.confirm({ assignments }, 'admin-1'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(pushNotifier.notifyAssignmentChanged).not.toHaveBeenCalled();
    });

    it('acepta las asignaciones en otro orden', async () => {
      const { assignments } = await service.preview({});

      await expect(
        service.confirm({ assignments: [...assignments].reverse() }, 'admin-1'),
      ).resolves.toMatchObject({ saved: 6 });
    });

    it('409 AUTO_ASSIGNMENT_OUTDATED si el plan cambió y no guarda nada', async () => {
      const { assignments } = await service.preview({});
      // Entre la vista previa y la confirmación alguien asignó a mano.
      tx.team.findMany.mockResolvedValue([
        dbTeam(1, 'N1-A-01', { assigned: [users[1]] }),
        dbTeam(2, 'N1-A-02'),
      ]);

      const error = await service
        .confirm({ assignments }, 'admin-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: AUTO_ASSIGNMENT_OUTDATED_CODE,
      });
      expect(tx.team.update).not.toHaveBeenCalled();
      expect(tx.jurorAssignmentAuditLog.createMany).not.toHaveBeenCalled();
    });

    it('409 si se envía una lista distinta a la del plan', async () => {
      const { assignments } = await service.preview({});

      await expect(
        service.confirm({ assignments: assignments.slice(1) }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('400 EDITION_READ_ONLY si editionId no es la edición activa, sin abrir la transacción', async () => {
      const { assignments } = await service.preview({});

      const error = await service
        .confirm({ assignments, editionId: 4 }, 'admin-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: EDITION_READ_ONLY,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.team.update).not.toHaveBeenCalled();
    });

    it('acepta editionId cuando es la edición activa', async () => {
      const { assignments } = await service.preview({});

      await expect(
        service.confirm({ assignments, editionId: 5 }, 'admin-1'),
      ).resolves.toMatchObject({ saved: 6 });
    });

    it('404 NO_ACTIVE_EDITION si no hay edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      const error = await service
        .confirm({ assignments: [] }, 'admin-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: NO_ACTIVE_EDITION,
      });
    });

    it('confirma siempre sobre la edición activa', async () => {
      await service.confirm({ assignments: [] }, 'admin-1').catch(() => null);

      expect(prisma.edition.findFirst).toHaveBeenCalled();
      expect(prisma.edition.findUnique).not.toHaveBeenCalled();
    });

    it('si falla al guardar responde 500 y la transacción se revierte', async () => {
      const { assignments } = await service.preview({});
      tx.jurorAssignmentAuditLog.createMany.mockRejectedValue(
        new Error('db caída'),
      );

      await expect(service.confirm({ assignments }, 'admin-1')).rejects.toThrow(
        /Se revirtió todo/,
      );
      await expect(
        service.confirm({ assignments }, 'admin-1'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('sin asignaciones nuevas responde sin escribir', async () => {
      tx.team.findMany.mockResolvedValue([
        dbTeam(1, 'N1-A-01', { assigned: [users[0], users[1], users[2]] }),
      ]);
      prisma.team.findMany = tx.team.findMany;

      const { assignments } = await service.preview({});
      const result = await service.confirm({ assignments }, 'admin-1');

      expect(assignments).toEqual([]);
      expect(result.saved).toBe(0);
      expect(tx.team.update).not.toHaveBeenCalled();
      expect(tx.jurorAssignmentAuditLog.createMany).not.toHaveBeenCalled();
    });
  });
});
