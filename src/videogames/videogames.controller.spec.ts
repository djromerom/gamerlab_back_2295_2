import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';

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

describe('VideogamesController', () => {
  let controller: VideogamesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideogamesController],
      providers: [
        { provide: VideogamesService, useValue: mockVideogamesService },
      ],
    }).compile();

    controller = module.get<VideogamesController>(VideogamesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── toggleLike ────────────────────────────────────────────────────────────

  describe('POST :id/toggle-like', () => {
    it('delegates to service with parsed videogameId and visitorId', async () => {
      mockVideogamesService.toggleLike.mockResolvedValue({
        liked: true,
        likeCount: 6,
      });

      const result = await controller.toggleLike('1', 'visitor-abc');

      expect(mockVideogamesService.toggleLike).toHaveBeenCalledWith(
        1,
        'visitor-abc',
      );
      expect(result).toEqual({ liked: true, likeCount: 6 });
    });

    it('propagates ConflictException from service (double-click)', async () => {
      mockVideogamesService.toggleLike.mockRejectedValue(
        new ConflictException('You have already liked this game.'),
      );

      await expect(controller.toggleLike('1', 'visitor-abc')).rejects.toThrow(
        ConflictException,
      );
    });

    it('propagates NotFoundException from service', async () => {
      mockVideogamesService.toggleLike.mockRejectedValue(
        new NotFoundException('Videogame with ID 99 not found'),
      );

      await expect(controller.toggleLike('99', 'visitor-abc')).rejects.toThrow(
        NotFoundException,
      );
    });
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