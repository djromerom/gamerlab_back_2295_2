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
  logoUrl: 'https://cdn.example.com/logo.png',
  videoUrl: null,
  additionalImages: [],
  _count: { likedBy: 5 },
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
    count: jest.fn(),
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
    await expect(service.toggleLike(99, 'user-uuid-1')).rejects.toThrow(NotFoundException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
    expect(prisma.videogameLike.delete).not.toHaveBeenCalled();
  });

  it('creates a like and returns liked:true with computed count when user has not liked yet', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ _count: { likedBy: 5 } }));
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockResolvedValue({});

    const result = await service.toggleLike(1, 'user-uuid-1');

    expect(result).toEqual({ liked: true, likeCount: 6 });
    expect(prisma.videogameLike.create).toHaveBeenCalledWith({
      data: { videogameId: 1, userId: 'user-uuid-1' },
    });
  });

  it('deletes the like and returns liked:false with computed count when user already liked', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ _count: { likedBy: 5 } }));
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 10 });
    prisma.videogameLike.delete.mockResolvedValue({});

    const result = await service.toggleLike(1, 'user-uuid-1');

    expect(result).toEqual({ liked: false, likeCount: 4 });
    expect(prisma.videogameLike.delete).toHaveBeenCalledWith({
      where: { videogameId_userId: { videogameId: 1, userId: 'user-uuid-1' } },
    });
  });

  it('toggles to unlike on second call (user who already liked calls again)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame({ _count: { likedBy: 6 } }));
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 10 });
    prisma.videogameLike.delete.mockResolvedValue({});

    const result = await service.toggleLike(1, 'user-uuid-1');
    expect(result).toEqual({ liked: false, likeCount: 5 });
  });

  it('throws ConflictException when DB unique constraint fires (P2002)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockRejectedValue(p2002());

    await expect(service.toggleLike(1, 'user-uuid-1')).rejects.toThrow(ConflictException);
  });

  it('two concurrent like requests: first succeeds, second gets ConflictException', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(p2002());
    prisma.videogameLike.count.mockResolvedValue(6);

    const [first, second] = await Promise.allSettled([
      service.toggleLike(1, 'user-uuid-1'),
      service.toggleLike(1, 'user-uuid-1'),
    ]);
    expect(first.status).toBe('fulfilled');
    expect((first as PromiseFulfilledResult<any>).value).toEqual({ liked: true, likeCount: 6 });
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  // ─── LÍMITES POR CONTENIDO (10 y 20 likes) ────────────────────────────────

  it('ALLOWS like when game has no content and no logo, but is exactly at limit - 1 (9 likes)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 9 }, logoUrl: null, videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockResolvedValue({});

    const result = await service.toggleLike(1, 'user-2');
    expect(result).toEqual({ liked: true, likeCount: 10 });
    expect(prisma.videogameLike.create).toHaveBeenCalled();
  });

  it('throws BadRequestException at 10-like cap when game has no content and no logo', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 10 }, logoUrl: null, videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException at 20-like cap when game has logo but no video/images', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 20 }, logoUrl: 'logo.png', videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
  });

  it('ALLOWS like when game has logo but no video/images, and is exactly at limit - 1 (19 likes)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 19 }, logoUrl: 'logo.png', videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockResolvedValue({});

    const result = await service.toggleLike(1, 'user-3');
    expect(result).toEqual({ liked: true, likeCount: 20 });
    expect(prisma.videogameLike.create).toHaveBeenCalled();
  });

  it('does NOT enforce cap when game has video content', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 50 }, logoUrl: null, videoUrl: 'https://yt.be/abc', additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockResolvedValue({});
    const result = await service.toggleLike(1, 'user-1');
    expect(result).toEqual({ liked: true, likeCount: 51 });
  });

  // ─── LÍMITE ABSOLUTO (MAX_LIKES) ──────────────────────────────────────────

  it('ALLOWS like when game has reached exactly MAX_LIKES - 1', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 999998 }, videoUrl: 'https://yt.be/abc' }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockResolvedValue({});

    const result = await service.toggleLike(1, 'user-max-1');
    expect(result).toEqual({ liked: true, likeCount: 999999 });
    expect(prisma.videogameLike.create).toHaveBeenCalled();
  });

  it('throws BadRequestException at absolute MAX_LIKES cap', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 999999 }, videoUrl: 'https://yt.be/abc' }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, 'user-max-fail')).rejects.toThrow(BadRequestException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
  });

  it('re-throws unexpected errors from create', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.toggleLike(1, 'user-uuid-1')).rejects.toThrow('DB connection lost');
  });
});

// ============================================================================
// getMyLike
// ============================================================================

describe('VideogamesService – getMyLike', () => {
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

  it('returns { liked: true } when the user has liked the game', async () => {
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 42 });
    const result = await service.getMyLike(1, 'user-uuid-1');
    expect(result).toEqual({ liked: true });
  });

  it('returns { liked: false } when the user has not liked the game', async () => {
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    const result = await service.getMyLike(1, 'user-uuid-1');
    expect(result).toEqual({ liked: false });
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

  it('returns videogameId and COUNT of likes', async () => {
    prisma.videogame.findUnique.mockResolvedValue({ id: 1 });
    prisma.videogameLike.count.mockResolvedValue(42);

    const result = await service.getLikes(1);
    expect(result).toEqual({ videogameId: 1, likes: 42 });
    expect(prisma.videogameLike.count).toHaveBeenCalledWith({ where: { videogameId: 1 } });
  });

  it('throws NotFoundException when videogame not found', async () => {
    prisma.videogame.findUnique.mockResolvedValue(null);
    await expect(service.getLikes(99)).rejects.toThrow(NotFoundException);
    expect(prisma.videogameLike.count).not.toHaveBeenCalled();
  });
});