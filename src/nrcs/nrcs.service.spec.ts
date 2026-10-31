import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NrcsService } from './nrcs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NrcsService', () => {
  let service: NrcsService;

  const mockPrismaService = {
    edition: { findFirst: jest.fn() },
    nRC: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
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
      });
      mockPrismaService.nRC.findFirst.mockResolvedValue(null);
      mockPrismaService.nRC.update.mockRejectedValue(p2002());

      await expect(service.update(5, { code: 1234 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
