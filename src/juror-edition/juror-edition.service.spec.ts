import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { PrismaService } from '../prisma/prisma.service';
import { JurorEditionController } from './juror-edition.controller';
import { JurorEditionService } from './juror-edition.service';

const ACTOR = 'admin-1';
const active = {
  id: 5,
  title: 'Feria 2026-30',
  status: 'ACTIVE',
  year: 2026,
  semester: 30,
};
const archived = { ...active, id: 3, status: 'ARCHIVED' };
const finished = {
  ...active,
  id: 4,
  status: 'INACTIVE',
  endsAt: new Date('2026-05-30T00:00:00Z'),
};

const juror = (id: string, extra: object = {}) => ({
  id,
  firstName: 'Ana',
  lastName: `Apellido ${id}`,
  email: `${id}@x.com`,
  jurorCategory: 'JUNIOR',
  role: { name: 'Jurado' },
  ...extra,
});

/** Primer argumento de una llamada a un mock, tipado. */
const callArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as unknown[][])[call][0] as T;

describe('JurorEditionService (HU-25)', () => {
  let service: JurorEditionService;
  const prisma = {
    edition: { findUnique: jest.fn(), findFirst: jest.fn() },
    jurorEdition: {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(active);
    prisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
    const module = await Test.createTestingModule({
      providers: [
        JurorEditionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(JurorEditionService);
  });

  describe('list', () => {
    it('une inscritos y profesores automáticos; el profesor gana si aparece en ambos', async () => {
      prisma.jurorEdition.findMany.mockResolvedValue([
        {
          type: 'OFFICIAL',
          status: 'PENDING',
          updatedAt: new Date('2026-11-03T00:00:00Z'),
          juror: juror('j1'),
        },
        {
          type: 'BACKUP',
          status: 'CONFIRMED',
          updatedAt: null,
          juror: juror('p1'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        juror('p1', { jurorCategory: null, role: { name: 'Profesor' } }),
      ]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.edition).toEqual({
        id: 5,
        title: 'Feria 2026-30',
        status: 'ACTIVE',
        writable: true,
      });
      expect(result.data).toEqual([
        expect.objectContaining({
          jurorId: 'j1',
          status: 'PENDING',
          type: 'OFFICIAL',
          source: 'ENROLLED',
          category: 'Junior',
          email: 'j1@x.com',
        }),
        expect.objectContaining({
          jurorId: 'p1',
          status: 'AUTOMATIC',
          type: null,
          source: 'PROFESSOR_NRC',
          category: 'Senior',
        }),
      ]);
      expect(result.counts).toEqual({
        PENDING: 1,
        CONFIRMED: 0,
        DECLINED: 0,
        AUTOMATIC: 1,
      });
      // Solo jurados con cuenta activa y de la edición resuelta.
      expect(
        callArg<{ where: unknown }>(prisma.jurorEdition.findMany).where,
      ).toEqual({
        editionId: 5,
        juror: {
          isActive: true,
          role: { name: { in: ['Jurado', 'Profesor'] } },
        },
      });
    });

    it('usa la edición pedida y responde 404 si no existe', async () => {
      prisma.edition.findUnique.mockResolvedValue(null);
      await expect(
        service.list({ editionId: 99, page: 1, limit: 20 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('404 si no hay edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(service.list({ page: 1, limit: 20 })).rejects.toThrow(
        'No hay una edición activa',
      );
    });

    it('una edición archivada se puede leer', async () => {
      prisma.edition.findUnique.mockResolvedValue(archived);
      prisma.jurorEdition.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.list({ editionId: 3, page: 1, limit: 20 });
      expect(result.edition.status).toBe('ARCHIVED');
    });
  });

  describe('importPrevious', () => {
    beforeEach(() => {
      prisma.edition.findFirst
        .mockResolvedValueOnce(active) // edición activa
        .mockResolvedValueOnce({ id: 4 }); // anterior
    });

    it('trae como Pendientes a los confirmados de la anterior, conserva su tipo y no duplica', async () => {
      prisma.jurorEdition.count.mockResolvedValue(10);
      prisma.jurorEdition.findMany.mockResolvedValue([
        { jurorId: 'a', type: 'OFFICIAL' },
        { jurorId: 'b', type: 'BACKUP' },
        { jurorId: 'c', type: 'OFFICIAL' },
      ]);
      prisma.jurorEdition.createMany.mockResolvedValue({ count: 2 });

      const result = await service.importPrevious({}, ACTOR);

      expect(result).toEqual({
        sourceEditionId: 4,
        created: 2,
        skipped: 1,
        fallback: false,
      });
      expect(
        callArg<{ where: unknown }>(prisma.jurorEdition.findMany).where,
      ).toEqual({
        editionId: 4,
        status: 'CONFIRMED',
        juror: {
          isActive: true,
          role: { name: { in: ['Jurado', 'Profesor'] } },
        },
      });
      const createArg = callArg<{ data: unknown[]; skipDuplicates: boolean }>(
        prisma.jurorEdition.createMany,
      );
      expect(createArg.skipDuplicates).toBe(true);
      expect(createArg.data[1]).toEqual({
        jurorId: 'b',
        editionId: 5,
        type: 'BACKUP',
        status: 'PENDING',
        updatedById: ACTOR,
      });
      // La anterior se busca por año y semestre, no por id.
      expect(
        callArg<{ where: unknown }>(prisma.edition.findFirst, 1).where,
      ).toEqual({
        OR: [{ year: { lt: 2026 } }, { year: 2026, semester: { lt: 30 } }],
      });
    });

    it('si la anterior no tiene lista, trae a todos los jurados activos (fallback)', async () => {
      prisma.jurorEdition.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([
        { id: 'a', jurorType: 'BACKUP' },
        { id: 'b', jurorType: null },
      ]);
      prisma.jurorEdition.createMany.mockResolvedValue({ count: 2 });

      const result = await service.importPrevious({}, ACTOR);

      expect(result).toEqual({
        sourceEditionId: 4,
        created: 2,
        skipped: 0,
        fallback: true,
      });
      expect(callArg<{ where: unknown }>(prisma.user.findMany).where).toEqual({
        isActive: true,
        role: { name: 'Jurado' },
      });
      const data = callArg<{ data: { type: string }[] }>(
        prisma.jurorEdition.createMany,
      ).data;
      expect(data.map((row) => row.type)).toEqual(['BACKUP', 'OFFICIAL']);
    });

    it('sin candidatos no llama a createMany', async () => {
      prisma.jurorEdition.count.mockResolvedValue(3);
      prisma.jurorEdition.findMany.mockResolvedValue([]);

      const result = await service.importPrevious({}, ACTOR);

      expect(result).toMatchObject({ created: 0, skipped: 0 });
      expect(prisma.jurorEdition.createMany).not.toHaveBeenCalled();
    });

    it('404 si no hay edición anterior', async () => {
      prisma.edition.findFirst.mockReset();
      prisma.edition.findFirst
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(null);
      await expect(service.importPrevious({}, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('400 si la edición está archivada', async () => {
      prisma.edition.findUnique.mockResolvedValue(archived);
      await expect(
        service.importPrevious({ editionId: 3 }, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.jurorEdition.createMany).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      prisma.jurorEdition.findMany.mockResolvedValue([
        { jurorId: 'a' },
        { jurorId: 'b' },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'prof' }]);
      prisma.jurorEdition.update.mockResolvedValue({ id: 1 });
      prisma.jurorEdition.updateMany.mockResolvedValue({ count: 4 });
    });

    it('responde por fila: una fila con error no impide guardar las demás', async () => {
      const result = await service.updateStatus(
        {
          items: [
            { jurorId: 'a', status: 'CONFIRMED', type: 'BACKUP' },
            { jurorId: 'prof', status: 'CONFIRMED' },
            { jurorId: 'b', status: 'DECLINED' },
            { jurorId: 'nadie', status: 'CONFIRMED' },
          ],
        },
        ACTOR,
      );

      expect(result).toEqual({
        results: [
          { jurorId: 'a', ok: true },
          { jurorId: 'prof', ok: false, error: 'IS_PROFESSOR' },
          { jurorId: 'b', ok: true },
          { jurorId: 'nadie', ok: false, error: 'NOT_ENROLLED' },
        ],
        declined: 0,
      });
      expect(prisma.jurorEdition.update).toHaveBeenCalledTimes(2);
      expect(callArg<unknown>(prisma.jurorEdition.update)).toEqual({
        where: { jurorId_editionId: { jurorId: 'a', editionId: 5 } },
        data: { status: 'CONFIRMED', type: 'BACKUP', updatedById: ACTOR },
        select: { id: true },
      });
      // Sin type se conserva el tipo actual.
      expect(
        callArg<{ data: object }>(prisma.jurorEdition.update, 1).data,
      ).toEqual({ status: 'DECLINED', updatedById: ACTOR });
      expect(prisma.jurorEdition.updateMany).not.toHaveBeenCalled();
      // Solo se busca entre los no inscritos a los profesores automáticos de la edición.
      expect(callArg<{ where: unknown }>(prisma.user.findMany).where).toEqual({
        isActive: true,
        role: { name: 'Profesor' },
        managedNrcs: { some: { editionId: 5, isActive: true } },
        id: { in: ['prof', 'nadie'] },
      });
    });

    it('declineRemaining pasa a Declinó solo a los Pendientes que no vienen en items', async () => {
      const result = await service.updateStatus(
        {
          declineRemaining: true,
          items: [
            { jurorId: 'a', status: 'CONFIRMED' },
            { jurorId: 'nadie', status: 'CONFIRMED' },
          ],
        },
        ACTOR,
      );

      expect(result.declined).toBe(4);
      expect(callArg<unknown>(prisma.jurorEdition.updateMany)).toEqual({
        where: {
          editionId: 5,
          status: 'PENDING',
          jurorId: { notIn: ['a', 'nadie'] },
        },
        data: { status: 'DECLINED', updatedById: ACTOR },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('no consulta roles si todos están inscritos', async () => {
      await service.updateStatus(
        { items: [{ jurorId: 'a', status: 'PENDING' }] },
        ACTOR,
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('400 si la edición está archivada', async () => {
      prisma.edition.findUnique.mockResolvedValue(archived);
      await expect(
        service.updateStatus(
          { editionId: 3, items: [{ jurorId: 'a', status: 'CONFIRMED' }] },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('400 si la edición está inactiva y ya terminó (nota 1 de #218)', async () => {
      prisma.edition.findUnique.mockResolvedValue(finished);
      await expect(
        service.updateStatus(
          { editionId: 4, items: [{ jurorId: 'a', status: 'CONFIRMED' }] },
          ACTOR,
        ),
      ).rejects.toThrow('La edición ya terminó');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('enroll', () => {
    const user = {
      ...juror('j9'),
      email: 'ana@empresa.com',
      isActive: true,
    };

    it('inscribe ya confirmado con el tipo pedido', async () => {
      prisma.user.findMany.mockResolvedValue([user]);
      prisma.jurorEdition.findUnique.mockResolvedValue(null);
      prisma.jurorEdition.create.mockResolvedValue({
        type: 'BACKUP',
        status: 'CONFIRMED',
        updatedAt: new Date('2026-11-03T00:00:00Z'),
        juror: juror('j9'),
      });

      const result = await service.enroll(
        { email: 'ana@empresa.com', type: 'BACKUP' },
        ACTOR,
      );

      expect(result).toMatchObject({
        jurorId: 'j9',
        status: 'CONFIRMED',
        type: 'BACKUP',
        source: 'ENROLLED',
      });
      expect(
        callArg<{ data: unknown }>(prisma.jurorEdition.create).data,
      ).toEqual({
        jurorId: 'j9',
        editionId: 5,
        status: 'CONFIRMED',
        type: 'BACKUP',
        updatedById: ACTOR,
      });
    });

    it('404 si no hay cuenta o está inactiva', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await expect(
        service.enroll({ email: 'ana@empresa.com' }, ACTOR),
      ).rejects.toThrow(NotFoundException);

      prisma.user.findMany.mockResolvedValue([{ ...user, isActive: false }]);
      await expect(
        service.enroll({ email: 'ana@empresa.com' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('400 si la cuenta no es de rol Jurado ni Profesor', async () => {
      prisma.user.findMany.mockResolvedValue([
        { ...user, role: { name: 'Estudiante' } },
      ]);
      await expect(
        service.enroll({ email: 'ana@empresa.com' }, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.jurorEdition.create).not.toHaveBeenCalled();
    });

    it('409 con el estado actual si ya está en la edición', async () => {
      prisma.user.findMany.mockResolvedValue([user]);
      prisma.jurorEdition.findUnique.mockResolvedValue({ status: 'DECLINED' });
      await expect(
        service.enroll({ email: 'ana@empresa.com' }, ACTOR),
      ).rejects.toThrow('El jurado ya está en esta edición como Declinó');
    });

    it('409 si otra inscripción simultánea gana la carrera (P2002)', async () => {
      prisma.user.findMany.mockResolvedValue([user]);
      prisma.jurorEdition.findUnique.mockResolvedValue(null);
      prisma.jurorEdition.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('único', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.enroll({ email: 'ana@empresa.com' }, ACTOR),
      ).rejects.toThrow(ConflictException);
    });
  });
});

describe('JurorEditionController (HU-25)', () => {
  const proto = JurorEditionController.prototype as unknown as Record<
    string,
    () => unknown
  >;

  it('protege todas las rutas con RolePermissionGuard', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      JurorEditionController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
  });

  it.each([
    ['list', 'ListEditionJurors'],
    ['importPrevious', 'ManageEditionJurors'],
    ['updateStatus', 'ManageEditionJurors'],
    ['enroll', 'ManageEditionJurors'],
  ])('%s exige el servicio %s', (handler, serviceName) => {
    expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, proto[handler])).toBe(
      serviceName,
    );
  });
});
