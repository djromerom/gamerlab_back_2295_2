import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ─── Factories ──────────────────────────────────────────────────────────────

const makeVideogame = (overrides = {}) => ({
  likes: 5,
  logoUrl: 'https://cdn.example.com/logo.png',
  videoUrl: null,
  additionalImages: [],
  ...overrides,
});

const makePrisma = () => ({
  videogame: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  videogameLike: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
});

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.0.0',
    meta: {},
  });

const p2025 = () =>
  new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: '5.0.0',
    meta: {},
  });

// ============================================================================
// toggleLike
// ============================================================================

describe('VideogamesService – toggleLike', () => {
  let service: VideogamesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideogamesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<VideogamesService>(VideogamesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when videogame does not exist', async () => {
    prisma.videogame.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(99, 'visitor-1')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns liked:true and incremented count when visitor has not liked yet', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ likes: 5 }));
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([{}, { likes: 6 }]);
    const result = await service.toggleLike(1, 'visitor-1');
    expect(result).toEqual({ liked: true, likeCount: 6 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns liked:false and decremented count when visitor already liked', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ likes: 5 }));
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 10 });
    prisma.$transaction.mockResolvedValue([{}, { likes: 4 }]);
    const result = await service.toggleLike(1, 'visitor-1');
    expect(result).toEqual({ liked: false, likeCount: 4 });
  });

  it('clamps likeCount to 0 and corrects DB if decrement returns negative', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ likes: 0 }));
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 1 });
    prisma.$transaction.mockResolvedValue([{}, { likes: -1 }]);
    prisma.videogame.update.mockResolvedValue({ likes: 0 });
    const result = await service.toggleLike(1, 'visitor-1');
    expect(result.likeCount).toBe(0);
    expect(result.liked).toBe(false);
    expect(prisma.videogame.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likes: 0 } }),
    );
  });

  it('toggles to unlike on second call (visitor who already liked calls again)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ likes: 6 }));
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 10 });
    prisma.$transaction.mockResolvedValue([{}, { likes: 5 }]);
    const result = await service.toggleLike(1, 'visitor-1');
    expect(result).toEqual({ liked: false, likeCount: 5 });
  });

  it('throws ConflictException when DB unique constraint fires (P2002)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(p2002());
    await expect(service.toggleLike(1, 'visitor-1')).rejects.toThrow(ConflictException);
  });

  it('two concurrent like requests: first succeeds, second gets ConflictException', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.$transaction
      .mockResolvedValueOnce([{}, { likes: 6 }])
      .mockRejectedValueOnce(p2002());
    const [first, second] = await Promise.allSettled([
      service.toggleLike(1, 'visitor-1'),
      service.toggleLike(1, 'visitor-1'),
    ]);
    expect(first.status).toBe('fulfilled');
    expect((first as PromiseFulfilledResult<any>).value).toEqual({ liked: true, likeCount: 6 });
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('throws BadRequestException at 10-like cap when game has no content and no logo', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ likes: 10, logoUrl: null, videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, 'visitor-X')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws BadRequestException at 20-like cap when game has logo but no video/images', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ likes: 20, logoUrl: 'logo.png', videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, 'visitor-X')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT enforce cap when game has video content', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ likes: 50, logoUrl: null, videoUrl: 'https://yt.be/abc', additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([{}, { likes: 51 }]);
    const result = await service.toggleLike(1, 'visitor-Y');
    expect(result).toEqual({ liked: true, likeCount: 51 });
  });

  it('re-throws unexpected errors from $transaction', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(new Error('DB connection lost'));
    await expect(service.toggleLike(1, 'visitor-1')).rejects.toThrow('DB connection lost');
  });
});

// ============================================================================
// setLikes
// ============================================================================

describe('VideogamesService – setLikes', () => {
  let service: VideogamesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideogamesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<VideogamesService>(VideogamesService);
  });

  it('throws BadRequestException for negative likes', async () => {
    await expect(service.setLikes(1, -1)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for likes exceeding 999,999', async () => {
    await expect(service.setLikes(1, 1_000_000)).rejects.toThrow(BadRequestException);
  });

  it('accepts 0 as valid value (counter reset)', async () => {
    prisma.videogame.update.mockResolvedValue({ likes: 0 });
    const result = await service.setLikes(1, 0);
    expect(result).toEqual({ videogameId: 1, likeCount: 0 });
  });

  it('accepts MAX boundary value 999,999', async () => {
    prisma.videogame.update.mockResolvedValue({ likes: 999999 });
    const result = await service.setLikes(1, 999999);
    expect(result).toEqual({ videogameId: 1, likeCount: 999999 });
  });

  it('throws NotFoundException when videogame not found (P2025)', async () => {
    prisma.videogame.update.mockRejectedValue(p2025());
    await expect(service.setLikes(99, 5)).rejects.toThrow(NotFoundException);
  });
});

// ============================================================================
// getLikes
// ============================================================================

describe('VideogamesService – getLikes', () => {
  let service: VideogamesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideogamesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<VideogamesService>(VideogamesService);
  });

  it('returns videogameId and likes', async () => {
    prisma.videogame.findUnique.mockResolvedValue({ likes: 42 });
    const result = await service.getLikes(1);
    expect(result).toEqual({ videogameId: 1, likes: 42 });
  });

  it('throws NotFoundException when videogame not found', async () => {
    prisma.videogame.findUnique.mockResolvedValue(null);
    await expect(service.getLikes(99)).rejects.toThrow(NotFoundException);
  });
});