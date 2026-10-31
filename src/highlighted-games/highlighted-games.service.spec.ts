import { blobRefsProvider } from '../upload/blob-reference.mock';
import { Test, TestingModule } from '@nestjs/testing';
import { HighlightedGamesService } from './highlighted-games.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('HighlightedGamesService', () => {
  let service: HighlightedGamesService;
  let prisma: PrismaService;

  const mockGame = {
    id: 1,
    editionId: 1,
    videogameId: 1,
  };

  const mockPrismaService = {
    videogame: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, videogameStatusId: 1 }),
    },
    highlightedGame: {
      create: jest.fn().mockResolvedValue(mockGame),
      findMany: jest.fn().mockResolvedValue([mockGame]),
      findUnique: jest.fn().mockResolvedValue(mockGame),
      delete: jest.fn().mockResolvedValue(mockGame),
      count: jest.fn().mockResolvedValue(1),
    },
    // $transaction receives an array of Prisma queries and resolves them in order
    $transaction: jest.fn((queries) => Promise.all(queries)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HighlightedGamesService,
        blobRefsProvider,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<HighlightedGamesService>(HighlightedGamesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a highlighted game', async () => {
      const dto = { videogameId: 1 };
      const result = await service.create(1, dto);
      expect(prisma.highlightedGame.create).toHaveBeenCalledWith({
        data: { editionId: 1, videogameId: dto.videogameId },
      });
      expect(result).toEqual(mockGame);
    });

    it('should reject highlighting a videogame that is not confirmed', async () => {
      mockPrismaService.videogame.findUnique.mockResolvedValueOnce({ id: 1, videogameStatusId: 2 });
      await expect(service.create(1, { videogameId: 1 })).rejects.toThrow(BadRequestException);
      expect(prisma.highlightedGame.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return a paginated result of highlighted games', async () => {
      const query = { limit: 10, page: 1, includeInactive: false };
      const result = await service.findAll(1, query);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.highlightedGame.findMany).toHaveBeenCalledWith({
        where: { editionId: 1 },
        take: 10,
        skip: 0,
        include: { videogame: true },
      });
      expect(result).toMatchObject({
        data: [mockGame],
        metadata: {
          totalItems: 1,
          currentPage: 1,
          itemsPerPage: 10,
          totalPages: 1,
        },
      });
    });
  });

  describe('remove', () => {
    it('should remove a highlighted game', async () => {
      const result = await service.remove(1, 1);
      expect(prisma.highlightedGame.findUnique).toHaveBeenCalledWith({
        where: { editionId_videogameId: { editionId: 1, videogameId: 1 } },
      });
      expect(prisma.highlightedGame.delete).toHaveBeenCalledWith({
        where: { editionId_videogameId: { editionId: 1, videogameId: 1 } },
      });
      expect(result).toBeUndefined();
    });

    it('should throw NotFoundException if highlighted game does not exist', async () => {
      mockPrismaService.highlightedGame.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove(1, 99)).rejects.toThrow(NotFoundException);
    });
  });
});
