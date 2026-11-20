import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { JurorEditionService } from './juror-edition.service';

/**
 * HU-28 (ARK-150): inscribir por correo a profesores senior que no tienen NRC activo en la
 * edición. El resto del servicio (HU-25) se prueba en `juror-edition.service.spec.ts`.
 */
const ACTOR = 'admin-1';
const active = {
  id: 5,
  title: 'Feria 2026-30',
  status: 'ACTIVE',
  year: 2026,
  semester: 30,
};

const professor = (id: string, extra: object = {}) => ({
  id,
  firstName: 'Carlos',
  lastName: `Profe ${id}`,
  email: `${id}@uninorte.edu.co`,
  jurorCategory: null,
  role: { name: 'Profesor' },
  ...extra,
});

const callArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as unknown[][])[call][0] as T;

describe('JurorEditionService · profesores sin NRC (HU-28)', () => {
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

  describe('enroll', () => {
    const account = { ...professor('p9'), isActive: true };
    const createdRow = (type: string) => ({
      type,
      status: 'CONFIRMED',
      updatedAt: new Date('2026-11-04T00:00:00Z'),
      juror: professor('p9'),
    });

    it('inscribe a un profesor sin NRC en la edición: Confirmado, Senior y Oficial por defecto', async () => {
      prisma.user.findMany.mockResolvedValue([account]);
      prisma.user.count.mockResolvedValue(0);
      prisma.jurorEdition.findUnique.mockResolvedValue(null);
      prisma.jurorEdition.create.mockResolvedValue(createdRow('OFFICIAL'));

      const result = await service.enroll(
        { email: 'p9@uninorte.edu.co' },
        ACTOR,
      );

      expect(result).toMatchObject({
        jurorId: 'p9',
        status: 'CONFIRMED',
        type: 'OFFICIAL',
        source: 'ENROLLED',
        category: 'Senior',
      });
      expect(
        callArg<{ data: unknown }>(prisma.jurorEdition.create).data,
      ).toEqual({
        jurorId: 'p9',
        editionId: 5,
        status: 'CONFIRMED',
        type: 'OFFICIAL',
        updatedById: ACTOR,
      });
      // Se busca un NRC activo solo en la edición resuelta (uno de otra edición no cuenta).
      expect(callArg<{ where: unknown }>(prisma.user.count).where).toEqual({
        isActive: true,
        role: { name: 'Profesor' },
        managedNrcs: { some: { editionId: 5, isActive: true } },
        id: 'p9',
      });
    });

    it('respeta el tipo Suplente si se envía', async () => {
      prisma.user.findMany.mockResolvedValue([account]);
      prisma.user.count.mockResolvedValue(0);
      prisma.jurorEdition.findUnique.mockResolvedValue(null);
      prisma.jurorEdition.create.mockResolvedValue(createdRow('BACKUP'));

      const result = await service.enroll(
        { email: 'p9@uninorte.edu.co', type: 'BACKUP' },
        ACTOR,
      );

      expect(result.type).toBe('BACKUP');
      expect(
        callArg<{ data: { type: string } }>(prisma.jurorEdition.create).data
          .type,
      ).toBe('BACKUP');
    });

    it('409 si el profesor tiene un NRC activo en la edición (ya es automático)', async () => {
      prisma.user.findMany.mockResolvedValue([account]);
      prisma.user.count.mockResolvedValue(1);

      const attempt = service.enroll({ email: 'p9@uninorte.edu.co' }, ACTOR);
      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow(/tiene un NRC activo/);
      expect(prisma.jurorEdition.create).not.toHaveBeenCalled();
    });

    it('409 si el profesor ya está inscrito en la edición', async () => {
      prisma.user.findMany.mockResolvedValue([account]);
      prisma.user.count.mockResolvedValue(0);
      prisma.jurorEdition.findUnique.mockResolvedValue({ status: 'CONFIRMED' });

      await expect(
        service.enroll({ email: 'p9@uninorte.edu.co' }, ACTOR),
      ).rejects.toThrow('El jurado ya está en esta edición como Confirmado');
      expect(prisma.jurorEdition.create).not.toHaveBeenCalled();
    });

    it('400 para Staff o Estudiante, sin consultar NRC', async () => {
      for (const role of ['Staff', 'Estudiante']) {
        prisma.user.findMany.mockResolvedValue([
          { ...account, role: { name: role } },
        ]);
        await expect(
          service.enroll({ email: 'p9@uninorte.edu.co' }, ACTOR),
        ).rejects.toThrow(BadRequestException);
      }
      expect(prisma.user.count).not.toHaveBeenCalled();
      expect(prisma.jurorEdition.create).not.toHaveBeenCalled();
    });

    it('un jurado externo no consulta NRC', async () => {
      prisma.user.findMany.mockResolvedValue([
        { ...account, role: { name: 'Jurado' } },
      ]);
      prisma.jurorEdition.findUnique.mockResolvedValue(null);
      prisma.jurorEdition.create.mockResolvedValue({
        ...createdRow('OFFICIAL'),
        juror: professor('p9', {
          role: { name: 'Jurado' },
          jurorCategory: 'JUNIOR',
        }),
      });

      await service.enroll({ email: 'p9@uninorte.edu.co' }, ACTOR);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('muestra al profesor inscrito con su estado y tipo, y lo cuenta', async () => {
      prisma.jurorEdition.findMany.mockResolvedValue([
        {
          type: 'BACKUP',
          status: 'PENDING',
          updatedAt: new Date('2026-11-04T00:00:00Z'),
          juror: professor('p1'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.data).toEqual([
        expect.objectContaining({
          jurorId: 'p1',
          status: 'PENDING',
          type: 'BACKUP',
          source: 'ENROLLED',
          category: 'Senior',
        }),
      ]);
      expect(result.counts).toMatchObject({ PENDING: 1, AUTOMATIC: 0 });
    });

    it('si el profesor inscrito recibe después un NRC sale una sola vez, como automático', async () => {
      prisma.jurorEdition.findMany.mockResolvedValue([
        {
          type: 'BACKUP',
          status: 'CONFIRMED',
          updatedAt: null,
          juror: professor('p1'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([professor('p1')]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        jurorId: 'p1',
        status: 'AUTOMATIC',
        source: 'PROFESSOR_NRC',
      });
    });
  });

  describe('updateStatus', () => {
    it('el profesor inscrito se edita; el automático da IS_PROFESSOR y el que no tiene fila NOT_ENROLLED', async () => {
      prisma.jurorEdition.findMany.mockResolvedValue([{ jurorId: 'inscrito' }]);
      // Entre los no inscritos, solo "automatico" tiene NRC activo en la edición.
      prisma.user.findMany.mockResolvedValue([{ id: 'automatico' }]);
      prisma.jurorEdition.update.mockResolvedValue({ id: 1 });

      const result = await service.updateStatus(
        {
          items: [
            { jurorId: 'inscrito', status: 'DECLINED' },
            { jurorId: 'automatico', status: 'CONFIRMED' },
            { jurorId: 'sinFila', status: 'CONFIRMED' },
          ],
        },
        ACTOR,
      );

      expect(result.results).toEqual([
        { jurorId: 'inscrito', ok: true },
        { jurorId: 'automatico', ok: false, error: 'IS_PROFESSOR' },
        { jurorId: 'sinFila', ok: false, error: 'NOT_ENROLLED' },
      ]);
      expect(prisma.jurorEdition.update).toHaveBeenCalledTimes(1);
    });
  });
});
