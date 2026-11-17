import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NRC_PROFESSOR_SELECT, NrcsService } from './nrcs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NrcsService', () => {
  let service: NrcsService;

  const mockPrismaService = {
    edition: { findFirst: jest.fn() },
    nRC: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NrcsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<NrcsService>(NrcsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('NRC activo duplicado en la misma edición (P2002)', () => {
    const p2002 = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

    it('create responde 409 si el índice único rechaza el NRC', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.nRC.findFirst.mockResolvedValue(null);
      mockPrismaService.nRC.create.mockRejectedValue(p2002());

      await expect(
        service.create({ code: 1234, subjectId: 1, professorId: 'p1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('update responde 409 si el índice único rechaza el cambio', async () => {
      mockPrismaService.nRC.findUnique.mockResolvedValue({
        id: 5,
        editionId: 1,
        edition: { status: 'ACTIVE', title: 'Edición 1' },
      });
      mockPrismaService.nRC.findFirst.mockResolvedValue(null);
      mockPrismaService.nRC.update.mockRejectedValue(p2002());

      await expect(service.update(5, { code: 1234 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('ARK-130 (HU-27): NRC de una edición anterior', () => {
    const pastNrc = {
      id: 7,
      editionId: 4,
      isActive: true,
      code: 1111,
      edition: { status: 'INACTIVE', title: 'Feria 4' },
    };

    it('update responde 400 y no escribe', async () => {
      mockPrismaService.nRC.findUnique.mockResolvedValue(pastNrc);
      await expect(service.update(7, { code: 2222 })).rejects.toThrow(/el NRC.*Feria 4/);
      expect(mockPrismaService.nRC.update).not.toHaveBeenCalled();
    });

    it('remove responde 400 y no lo desactiva', async () => {
      mockPrismaService.nRC.findUnique.mockResolvedValue(pastNrc);
      await expect(service.remove(7)).rejects.toThrow(/solo lectura/);
      expect(mockPrismaService.nRC.update).not.toHaveBeenCalled();
    });
  });
  describe('findForSelect con materias (HU-31, selector por materia)', () => {
    const poo = {
      id: 1,
      name: 'Programación Orientada a Objetos',
      abrevName: 'POO',
    };

    it('devuelve abreviatura de la materia y nombre del profesor, sin otros datos del profesor', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValue({ id: 4 });
      mockPrismaService.nRC.findMany.mockResolvedValue([
        {
          id: 7,
          code: 2501,
          subjectId: 1,
          editionId: 4,
          subject: poo,
          professor: { firstName: 'Ana', lastName: 'Pérez' },
        },
      ]);

      await expect(service.findForSelect(true)).resolves.toEqual([
        {
          id: 7,
          code: 2501,
          subjectId: 1,
          editionId: 4,
          subject: poo,
          professorName: 'Ana Pérez',
        },
      ]);
      const args = mockPrismaService.nRC.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ isActive: true, editionId: 4 });
      expect(args.select.professor).toEqual({
        select: { firstName: true, lastName: true },
      });
    });

    it('sin includeSubjects no trae materia ni profesor', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValue({ id: 4 });
      mockPrismaService.nRC.findMany.mockResolvedValue([
        { id: 7, code: 2501, subjectId: 1, editionId: 4 },
      ]);

      await expect(service.findForSelect()).resolves.toEqual([
        { id: 7, code: 2501, subjectId: 1, editionId: 4 },
      ]);
      const args = mockPrismaService.nRC.findMany.mock.calls[0][0];
      expect(args.select.subject).toBeUndefined();
      expect(args.select.professor).toBeUndefined();
    });
  });

  describe('ARK-236 (BG-46): el profesor de /nrcs sin password', () => {
    const fullProfessor = {
      id: 'p1',
      email: 'ana@uninorte.edu.co',
      firstName: 'Ana',
      lastName: 'Pérez',
      password: '$2b$10$hashdeprueba',
      roleId: 3,
      microsoftOid: null,
    };
    const publicProfessor = {
      id: 'p1',
      email: 'ana@uninorte.edu.co',
      firstName: 'Ana',
      lastName: 'Pérez',
    };

    type NrcArgs = { include?: { professor?: unknown } };
    const firstCallArgs = (fn: jest.Mock) => (fn.mock.calls as NrcArgs[][])[0][0];

    // Imita a Prisma: con `select` devuelve solo esos campos; con `professor: true`, el usuario completo.
    const nrcWithProfessor = (args: NrcArgs) => {
      const relation = args.include?.professor as
        | true
        | { select: Record<string, boolean> }
        | undefined;
      const professor =
        relation === true
          ? fullProfessor
          : Object.fromEntries(
              Object.keys(relation?.select ?? {}).map((key) => [
                key,
                fullProfessor[key as keyof typeof fullProfessor],
              ]),
            );
      return { id: 5, code: 2501, editionId: 1, isActive: true, professor };
    };

    const expectSafeProfessor = (args: NrcArgs, nrc: unknown) => {
      expect(args.include?.professor).toEqual({ select: NRC_PROFESSOR_SELECT });
      expect(JSON.stringify(nrc)).not.toContain('password');
      expect((nrc as { professor: unknown }).professor).toEqual(publicProfessor);
    };

    it('el select del profesor no incluye password', () => {
      expect(NRC_PROFESSOR_SELECT).toEqual({
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      });
      expect(NRC_PROFESSOR_SELECT).not.toHaveProperty('password');
    });

    it('findAll (GET /nrcs)', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValue({
        id: 1,
        title: 'Edición 1',
        status: 'ACTIVE',
      });
      mockPrismaService.nRC.findMany.mockImplementation((args: NrcArgs) =>
        Promise.resolve([nrcWithProfessor(args)]),
      );
      mockPrismaService.nRC.count.mockResolvedValue(1);
      mockPrismaService.$transaction.mockImplementation(
        (ops: Promise<unknown>[]) => Promise.all(ops),
      );

      const result = await service.findAll(false, 10, 1);

      expect(result.data).toHaveLength(1);
      expectSafeProfessor(firstCallArgs(mockPrismaService.nRC.findMany), result.data[0]);
    });

    it('findOne (GET /nrcs/:id)', async () => {
      mockPrismaService.nRC.findUnique.mockImplementation((args: NrcArgs) =>
        Promise.resolve(nrcWithProfessor(args)),
      );

      const nrc = await service.findOne(5);

      expectSafeProfessor(firstCallArgs(mockPrismaService.nRC.findUnique), nrc);
    });

    it('create (POST /nrcs)', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.nRC.findFirst.mockResolvedValue(null);
      mockPrismaService.nRC.create.mockImplementation((args: NrcArgs) =>
        Promise.resolve(nrcWithProfessor(args)),
      );

      const nrc = await service.create({ code: 2501, subjectId: 1, professorId: 'p1' });

      expectSafeProfessor(firstCallArgs(mockPrismaService.nRC.create), nrc);
    });

    it('update (PATCH /nrcs/:id)', async () => {
      mockPrismaService.nRC.findUnique.mockResolvedValue({
        id: 5,
        code: 2501,
        editionId: 1,
        isActive: true,
        edition: { status: 'ACTIVE', title: 'Edición 1' },
      });
      mockPrismaService.nRC.findFirst.mockResolvedValue(null);
      mockPrismaService.nRC.update.mockImplementation((args: NrcArgs) =>
        Promise.resolve(nrcWithProfessor(args)),
      );

      const nrc = await service.update(5, { code: 2502, professorId: 'p1' });

      expectSafeProfessor(firstCallArgs(mockPrismaService.nRC.update), nrc);
    });
  });
});
