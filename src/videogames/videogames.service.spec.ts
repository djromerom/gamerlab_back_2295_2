import { blobRefsProvider } from '../upload/blob-reference.mock';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';
import { VideogamesGateway } from './videogames.gateway';
import { Prisma, PrismaClient } from '@prisma/client';

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

  const mockVideogamesGateway = {};

// ============================================================================
// toggleLike
// ============================================================================

describe('VideogamesService', () => {
  let service: VideogamesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideogamesService,
        blobRefsProvider,
        { 
          provide: PrismaService, 
          useValue: prisma 
        },
        { 
          provide: VideogamesGateway, 
          useValue: mockVideogamesGateway 
        },
      ],
    }).compile();
    service = module.get<VideogamesService>(VideogamesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when videogame does not exist', async () => {
    prisma.videogame.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(99, { userId: 'user-uuid-1' })).rejects.toThrow(NotFoundException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
    expect(prisma.videogameLike.delete).not.toHaveBeenCalled();
  });

  it('throws ConflictException when DB unique constraint fires (P2002)', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockRejectedValue(p2002());

    await expect(service.toggleLike(1, { userId: 'user-uuid-1' })).rejects.toThrow(ConflictException);
  });


  // ─── LÍMITES POR CONTENIDO (10 y 20 likes) ────────────────────────────────


  it('throws BadRequestException at 10-like cap when game has no content and no logo', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 10 }, logoUrl: null, videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, { userId: 'user-1' })).rejects.toThrow(BadRequestException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException at 20-like cap when game has logo but no video/images', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 20 }, logoUrl: 'logo.png', videoUrl: null, additionalImages: [] }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, { userId: 'user-1' })).rejects.toThrow(BadRequestException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
  });


  it('throws BadRequestException at absolute MAX_LIKES cap', async () => {
    prisma.videogame.findUnique.mockResolvedValue(
      makeVideogame({ _count: { likedBy: 999999 }, videoUrl: 'https://yt.be/abc' }),
    );
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    await expect(service.toggleLike(1, { userId: 'user-max-fail' })).rejects.toThrow(BadRequestException);
    expect(prisma.videogameLike.create).not.toHaveBeenCalled();
  });

  it('re-throws unexpected errors from create', async () => {
    prisma.videogame.findUnique.mockResolvedValue(makeVideogame());
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    prisma.videogameLike.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.toggleLike(1, { userId: 'user-uuid-1' })).rejects.toThrow('DB connection lost');
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
        blobRefsProvider,
        { 
          provide: PrismaService, 
          useValue: prisma 
        },
        {
          provide: VideogamesGateway,
          useValue: mockVideogamesGateway,
        },
      ],
    }).compile();
    service = module.get<VideogamesService>(VideogamesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns { liked: true } when the user has liked the game', async () => {
    prisma.videogameLike.findUnique.mockResolvedValue({ id: 42 });
    const result = await service.getMyLike(1, { userId: 'user-uuid-1' });
    expect(result).toEqual({ liked: true });
  });

  it('returns { liked: false } when the user has not liked the game', async () => {
    prisma.videogameLike.findUnique.mockResolvedValue(null);
    const result = await service.getMyLike(1, { userId: 'user-uuid-1' });
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
        blobRefsProvider,
        { 
          provide: PrismaService,
          useValue: prisma 
        },
        {
          provide: VideogamesGateway,
          useValue: mockVideogamesGateway
        },
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