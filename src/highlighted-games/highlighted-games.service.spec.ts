import { blobRefsProvider } from '../upload/blob-reference.mock';
import { Test, TestingModule } from '@nestjs/testing';
import { HighlightedGamesService } from './highlighted-games.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BlobReferenceService } from '../upload/blob-reference.service';

describe('HighlightedGamesService', () => {
  let service: HighlightedGamesService;
  let prisma: PrismaService;
  let blobRefs: BlobReferenceService;

  const mockGame = {
    id: 1,
    editionId: 1,
    videogameId: 1,
  };

  const mockPrismaService = {
    videogame: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, videogameStatusId: 1 }),
    },
    historicalVideogame: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 7, historicalTeam: { editionId: 1 } }),
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
    blobRefs = module.get<BlobReferenceService>(BlobReferenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Error de Prisma por la restricción única (edición, juego).
  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
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
      mockPrismaService.videogame.findUnique.mockResolvedValueOnce({
        id: 1,
        videogameStatusId: 2,
      });
      await expect(service.create(1, { videogameId: 1 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.highlightedGame.create).not.toHaveBeenCalled();
    });

    // HU-41 (ARK-229): juegos históricos
    it('destaca un juego histórico de la misma edición', async () => {
      await service.create(1, { historicalVideogameId: 7 });
      expect(
        mockPrismaService.historicalVideogame.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { id: true, historicalTeam: { select: { editionId: true } } },
      });
      expect(mockPrismaService.videogame.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.highlightedGame.create).toHaveBeenCalledWith({
        data: { editionId: 1, historicalVideogameId: 7 },
      });
    });

    it('rechaza un juego histórico de otra edición (400)', async () => {
      mockPrismaService.historicalVideogame.findUnique.mockResolvedValueOnce({
        id: 7,
        historicalTeam: { editionId: 2 },
      });
      await expect(
        service.create(1, { historicalVideogameId: 7 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.highlightedGame.create).not.toHaveBeenCalled();
    });

    it('rechaza un juego histórico que no existe (400)', async () => {
      mockPrismaService.historicalVideogame.findUnique.mockResolvedValueOnce(
        null,
      );
      await expect(
        service.create(1, { historicalVideogameId: 99 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.highlightedGame.create).not.toHaveBeenCalled();
    });

    it.each([
      ['los dos', { videogameId: 1, historicalVideogameId: 7 }],
      ['ninguno', {}],
    ])('rechaza si llegan %s ids (400)', async (_label, dto) => {
      await expect(service.create(1, dto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.videogame.findUnique).not.toHaveBeenCalled();
      expect(
        mockPrismaService.historicalVideogame.findUnique,
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.highlightedGame.create).not.toHaveBeenCalled();
    });

    it.each([
      ['en vivo', { videogameId: 1 }],
      ['histórico', { historicalVideogameId: 7 }],
    ])(
      'responde 409 si el juego %s ya está destacado en la edición',
      async (_label, dto) => {
        mockPrismaService.highlightedGame.create.mockRejectedValueOnce(
          uniqueViolation(),
        );
        await expect(service.create(1, dto)).rejects.toThrow(ConflictException);
      },
    );
  });

  describe('findAll', () => {
    it('should return a paginated result of highlighted games', async () => {
      const query = { limit: 10, page: 1, includeInactive: false };
      const result = await service.findAll(1, query);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.highlightedGame.findMany).toHaveBeenCalledWith({
        where: { editionId: 1, videogameId: { not: null } },
        take: 10,
        skip: 0,
        include: { videogame: true },
      });
      // HU-41 (ARK-229): el conteo usa el mismo filtro (solo juegos en vivo)
      expect(mockPrismaService.highlightedGame.count).toHaveBeenCalledWith({
        where: { editionId: 1, videogameId: { not: null } },
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
      expect(mockPrismaService.highlightedGame.findUnique).toHaveBeenCalledWith(
        {
          where: { editionId_videogameId: { editionId: 1, videogameId: 1 } },
        },
      );
      expect(mockPrismaService.highlightedGame.delete).toHaveBeenCalledWith({
        where: { editionId_videogameId: { editionId: 1, videogameId: 1 } },
      });
      expect(result).toBeUndefined();
    });

    it('should throw NotFoundException if highlighted game does not exist', async () => {
      mockPrismaService.highlightedGame.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeHistorical (HU-41)', () => {
    it('quita el destacado del juego histórico', async () => {
      mockPrismaService.highlightedGame.findUnique.mockResolvedValueOnce({
        id: 5,
      });
      const result = await service.removeHistorical(1, 7);
      expect(mockPrismaService.highlightedGame.findUnique).toHaveBeenCalledWith(
        {
          where: {
            editionId_historicalVideogameId: {
              editionId: 1,
              historicalVideogameId: 7,
            },
          },
          select: { id: true },
        },
      );
      expect(mockPrismaService.highlightedGame.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
      expect(result).toBeUndefined();
    });

    it('responde 404 si el juego histórico no está destacado', async () => {
      mockPrismaService.highlightedGame.findUnique.mockResolvedValueOnce(null);
      await expect(service.removeHistorical(1, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.highlightedGame.delete).not.toHaveBeenCalled();
    });
  });

  describe('findPublic (HU-41)', () => {
    const edition2026 = {
      id: 4,
      year: 2026,
      semester: 10,
      title: 'Feria 2026 - S1',
    };
    const edition2025 = {
      id: 3,
      year: 2025,
      semester: 30,
      title: 'Feria 2025 - S2',
    };
    const liveRow = (
      id: number,
      name: string,
      edition = edition2026,
      gameFileUrl: string | null = 'upload:zip',
    ) => ({
      id,
      edition,
      videogame: {
        id: 400 + id,
        name,
        logoUrl: `upload:logo-${id}`,
        gameFileUrl,
        allowMobile: true, // TA-36 (ARK-326)
        team: { teamName: `Equipo ${id}` },
      },
      historicalVideogame: null,
    });
    const historicalRow = (
      id: number,
      name: string,
      edition = edition2025,
      gameFileUrl: string | null = null,
    ) => ({
      id,
      edition,
      videogame: null,
      historicalVideogame: {
        id: 80 + id,
        name,
        logoUrl: null,
        gameFileUrl,
        allowMobile: false,
        historicalTeam: { teamName: `Histórico ${id}` },
      },
    });

    it('mapea juegos en vivo e históricos con el logo resuelto y sin datos personales', async () => {
      const resolve = jest
        .spyOn(blobRefs, 'resolve')
        .mockImplementation((v) =>
          Promise.resolve(v ? `https://signed/${v}` : v),
        );
      mockPrismaService.highlightedGame.findMany.mockResolvedValueOnce([
        liveRow(12, 'Ecos del Aula'),
        historicalRow(15, 'Ruta 66', edition2025, 'https://blob/juego.zip'),
      ]);

      const result = await service.findPublic();

      expect(result).toEqual([
        {
          id: 12,
          name: 'Ecos del Aula',
          teamName: 'Equipo 12',
          edition: edition2026,
          logoUrl: 'https://signed/upload:logo-12',
          hasGameFile: true,
          allowMobile: true,
          play: { type: 'live', id: 412 },
        },
        {
          id: 15,
          name: 'Ruta 66',
          teamName: 'Histórico 15',
          edition: edition2025,
          logoUrl: null,
          hasGameFile: true,
          allowMobile: false,
          play: { type: 'historical', id: 95 },
        },
      ]);
      for (const game of result) {
        expect(Object.keys(game).sort()).toEqual([
          'allowMobile',
          'edition',
          'hasGameFile',
          'id',
          'logoUrl',
          'name',
          'play',
          'teamName',
        ]);
      }
      expect(JSON.stringify(result)).not.toMatch(
        /members|email|correo|studentCode|userId/i,
      );
      resolve.mockRestore();
    });

    it('consulta con selección explícita, sin integrantes', async () => {
      mockPrismaService.highlightedGame.findMany.mockResolvedValueOnce([]);
      await service.findPublic();
      const [args] = mockPrismaService.highlightedGame.findMany.mock
        .calls[0] as [Prisma.HighlightedGameFindManyArgs];
      expect(args.where).toEqual({});
      expect(args.include).toBeUndefined();
      expect(JSON.stringify(args.select)).not.toMatch(/members|email|user/i);
    });

    it('filtra por edición cuando llega editionId', async () => {
      mockPrismaService.highlightedGame.findMany.mockResolvedValueOnce([]);
      expect(await service.findPublic(3)).toEqual([]);
      const [args] = mockPrismaService.highlightedGame.findMany.mock
        .calls[0] as [Prisma.HighlightedGameFindManyArgs];
      expect(args.where).toEqual({ editionId: 3 });
    });

    it('hasGameFile es falso si el archivo está vacío o solo tiene espacios', async () => {
      mockPrismaService.highlightedGame.findMany.mockResolvedValueOnce([
        liveRow(1, 'A', edition2026, '   '),
        liveRow(2, 'B', edition2026, null),
        historicalRow(3, 'C', edition2026, ''),
      ]);
      const result = await service.findPublic();
      expect(result.map((g) => g.hasGameFile)).toEqual([false, false, false]);
    });

    it('ordena por edición más reciente (año y semestre) y luego por nombre', async () => {
      const edition2026s2 = {
        id: 5,
        year: 2026,
        semester: 30,
        title: 'Feria 2026 - S2',
      };
      mockPrismaService.highlightedGame.findMany.mockResolvedValueOnce([
        historicalRow(1, 'Zeta', edition2025),
        liveRow(2, 'beta', edition2026),
        liveRow(3, 'Alfa', edition2026),
        liveRow(4, 'Omega', edition2026s2),
        historicalRow(5, 'Ábaco', edition2025),
      ]);
      const result = await service.findPublic();
      expect(result.map((g) => g.name)).toEqual([
        'Omega',
        'Alfa',
        'beta',
        'Ábaco',
        'Zeta',
      ]);
    });
  });
});
