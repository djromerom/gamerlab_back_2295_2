import { NotFoundException } from '@nestjs/common';
import { blobRefsProvider } from '../upload/blob-reference.mock';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalsService } from './historicals.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HistoricalsService', () => {
  let service: HistoricalsService;

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalsService,
        blobRefsProvider,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<HistoricalsService>(HistoricalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('HistoricalsService.getHistoricalGameFile (HU-40)', () => {
  const prisma = { historicalVideogame: { findUnique: jest.fn() } };
  const blobRefs = { resolve: jest.fn() };
  let service: HistoricalsService;

  const row = (over: Record<string, unknown> = {}) => ({
    id: 12,
    name: 'Ecos del Aula',
    gameFileUrl: 'upload:abc',
    entry: 'Build/index.html',
    historicalTeam: { teamName: 'Los Pixel', editionId: 3 },
    ...over,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        HistoricalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BlobReferenceService, useValue: blobRefs },
      ],
    }).compile();
    service = module.get(HistoricalsService);
  });

  it('devuelve el archivo firmado y el entry con la forma de GET /videogames/:id', async () => {
    prisma.historicalVideogame.findUnique.mockResolvedValue(row());
    blobRefs.resolve.mockResolvedValue('https://blob/juego.zip?sig=x');

    await expect(service.getHistoricalGameFile(12)).resolves.toEqual({
      id: 12,
      name: 'Ecos del Aula',
      teamName: 'Los Pixel',
      editionId: 3,
      gameFileURL: 'https://blob/juego.zip?sig=x',
      entry: 'Build/index.html',
    });
    expect(blobRefs.resolve).toHaveBeenCalledWith('upload:abc');
    expect(prisma.historicalVideogame.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 12 } }),
    );
  });

  it('no consulta integrantes ni datos personales', async () => {
    prisma.historicalVideogame.findUnique.mockResolvedValue(row());
    blobRefs.resolve.mockResolvedValue('u');
    await service.getHistoricalGameFile(12);
    expect(prisma.historicalVideogame.findUnique).toHaveBeenCalledWith({
      where: { id: 12 },
      select: {
        id: true,
        name: true,
        gameFileUrl: true,
        entry: true,
        allowMobile: true, // TA-36 (ARK-326)
        historicalTeam: { select: { teamName: true, editionId: true } },
      },
    });
  });

  it('sin zip responde gameFileURL y entry vacíos', async () => {
    prisma.historicalVideogame.findUnique.mockResolvedValue(row({ gameFileUrl: null, entry: null }));
    blobRefs.resolve.mockResolvedValue(null);

    const res = await service.getHistoricalGameFile(12);

    expect(res.gameFileURL).toBe('');
    expect(res.entry).toBe('');
  });

  it('si el archivo ya no existe en el almacenamiento, gameFileURL vacío', async () => {
    prisma.historicalVideogame.findUnique.mockResolvedValue(row());
    blobRefs.resolve.mockResolvedValue(null);
    await expect(service.getHistoricalGameFile(12)).resolves.toMatchObject({ gameFileURL: '' });
  });

  it('404 en español si el juego histórico no existe', async () => {
    prisma.historicalVideogame.findUnique.mockResolvedValue(null);
    await expect(service.getHistoricalGameFile(99)).rejects.toThrow(
      new NotFoundException('No existe el videojuego histórico 99'),
    );
  });
});
