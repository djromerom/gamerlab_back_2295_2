import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { UpdateHistoricalVideogameDto } from '../historicals/dto/update-historical-videogame.dto';
import { VideogameDto } from '../teams/dto/videogame.dto';
import { assertAllowMobileUnchanged } from '../teams/student-edit-policy';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { VideogamesService } from './videogames.service';
import { HistoricalsService } from '../historicals/historicals.service';

/**
 * TA-36 (ARK-326): «se puede jugar en celular» es un campo del videojuego que solo cambia el
 * administrador. Reemplaza la lista fija de ids del front (mobileFriendly.ts, ARK-317).
 */
describe('assertAllowMobileUnchanged', () => {
  it.each([
    [undefined, false],
    [false, false],
    [true, true],
  ])('deja pasar %s cuando el valor guardado es %s', (requested, current) => {
    expect(() => assertAllowMobileUnchanged(requested, current)).not.toThrow();
  });

  it.each([
    [true, false],
    [false, true],
  ])('responde 403 si el estudiante lo cambia a %s', (requested, current) => {
    expect(() => assertAllowMobileUnchanged(requested, current)).toThrow(
      ForbiddenException,
    );
  });
});

describe('DTOs con allowMobile', () => {
  it('PATCH acepta true/false y rechaza otros valores', async () => {
    const ok = plainToInstance(UpdateVideogameDto, { allowMobile: true });
    expect(await validate(ok)).toHaveLength(0);
    const bad = plainToInstance(UpdateVideogameDto, { allowMobile: 'si' });
    const errors = await validate(bad);
    expect(errors.map((e) => e.property)).toContain('allowMobile');
  });

  it.each(['si', 'false', 1])(
    'con la conversión implícita del ValidationPipe global, %p no se vuelve true: 400',
    async (value) => {
      const dto = plainToInstance(
        UpdateVideogameDto,
        { allowMobile: value },
        { enableImplicitConversion: true },
      );
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toContain('allowMobile');
    },
  );

  it('el histórico también lo acepta', async () => {
    const dto = plainToInstance(UpdateHistoricalVideogameDto, {
      allowMobile: false,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('la inscripción (VideogameDto) no lo declara: el ValidationPipe con whitelist lo descarta', async () => {
    const dto = plainToInstance(VideogameDto, {
      vgName: 'Juego',
      allowMobile: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((e) => e.property)).toContain('allowMobile');
  });
});

describe('VideogamesService con allowMobile', () => {
  const prisma = {
    videogame: { findUnique: jest.fn(), update: jest.fn() },
    eventConfiguration: { findFirst: jest.fn() },
  };
  const service = new VideogamesService(
    prisma as any,
    {} as any,
    blobRefsPassthrough(),
  );
  const leader = { id: 'leader-1', roleId: ROLE_IDS.STUDENT } as any;
  const admin = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;
  const game = {
    id: 7,
    name: 'Juego',
    teamId: 3,
    allowMobile: false,
    team: { userId: 'leader-1', edition: { status: 'ACTIVE', title: 'E5' } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.videogame.findUnique.mockResolvedValue(game);
    prisma.videogame.update.mockResolvedValue({ id: 7 });
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      registrationsOpen: true,
    });
  });

  it('el líder no lo puede activar por PATCH /videogames/:id', async () => {
    await expect(
      service.update(7, { allowMobile: true } as any, leader),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.videogame.update).not.toHaveBeenCalled();
  });

  it('el líder puede enviarlo con el valor guardado', async () => {
    await service.update(
      7,
      { description: 'x', allowMobile: false } as any,
      leader,
    );
    expect(prisma.videogame.update).toHaveBeenCalled();
  });

  it('el administrador lo activa', async () => {
    await service.update(7, { allowMobile: true } as any, admin);
    expect(prisma.videogame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ allowMobile: true }),
      }),
    );
  });

  it('GET /videogames/:id lo devuelve para /play-game', async () => {
    prisma.videogame.findUnique.mockResolvedValue({
      ...game,
      allowMobile: true,
      description: null,
      gameFileUrl: null,
      entry: null,
      team: { teamName: 'Equipo' },
      videogameStatus: { status: 'CONFIRMADO' },
      _count: { likedBy: 0 },
    });
    const res = await service.findOne(7);
    expect(res).toEqual(expect.objectContaining({ allowMobile: true }));
  });
});

describe('Archivar la edición (dumpEdition) con allowMobile', () => {
  it('copia «se puede jugar en celular» al videojuego histórico', async () => {
    const tx = {
      historicalTeam: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      team: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            teamName: 'Scroll',
            editionId: 5,
            isExternal: false,
            teamCode: null,
            members: [],
            videogame: {
              name: 'Juego',
              description: null,
              logoUrl: null,
              repoUrl: null,
              videoUrl: null,
              additionalImages: [],
              gameFileUrl: 'upload:zip',
              entry: 'index.html',
              allowMobile: true,
              _count: { likedBy: 0 },
            },
          },
        ]),
      },
      teamFinalScore: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new HistoricalsService({} as any, blobRefsPassthrough());
    await service.dumpEdition(tx as any, 5);
    expect(tx.historicalTeam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        videogame: {
          create: expect.objectContaining({ allowMobile: true }),
        },
      }),
    });
  });
});
