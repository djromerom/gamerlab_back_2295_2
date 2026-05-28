import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';
import { VideogamesGateway } from './videogames.gateway';

describe('VideogamesController', () => {
  let controller: VideogamesController;
  const mockVideogamesService = {
    findAll: jest.fn(),
    getLikes: jest.fn(),
    toggleLike: jest.fn(),
    setLikes: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockPrismaService = {};

  const mockVideogamesGateway = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideogamesController],
      providers: [
        { provide: VideogamesService, 
          useValue: mockVideogamesService 
        },
        { provide: PrismaService, 
          useValue: mockPrismaService 
        },
        { provide: VideogamesGateway, 
          useValue: mockVideogamesGateway 
        },
      ],
    }).compile();

    controller = module.get<VideogamesController>(VideogamesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── getLikes ──────────────────────────────────────────────────────────────

  describe('GET :id/likes', () => {
    it('returns likes for a videogame', async () => {
      mockVideogamesService.getLikes.mockResolvedValue({
        videogameId: 1,
        likes: 10,
      });

      const result = await controller.getLikes('1');

      expect(mockVideogamesService.getLikes).toHaveBeenCalledWith(1);
      expect(result).toEqual({ videogameId: 1, likes: 10 });
    });
  });
});