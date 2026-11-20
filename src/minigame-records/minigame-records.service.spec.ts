import { BadRequestException } from '@nestjs/common';
import { MinigameGame } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MinigameRecordsService } from './minigame-records.service';

type Row = {
  id: number;
  game: MinigameGame;
  track: string;
  alias: string;
  score: number;
  createdAt: Date;
};

/** Tabla en memoria con el mismo orden que pide el servicio (puntaje desc, fecha y id asc). */
function fakePrisma() {
  const rows: Row[] = [];
  let nextId = 1;
  let clock = Date.UTC(2026, 10, 26, 14);
  const matches = (where: Partial<Row> = {}) =>
    rows.filter(
      (r) =>
        (!where.game || r.game === where.game) &&
        (!where.track || r.track === where.track),
    );
  const sorted = (list: Row[]) =>
    [...list].sort(
      (a, b) =>
        b.score - a.score ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id - b.id,
    );
  const minigameRecord = {
    findMany: jest.fn(
      ({ where, take }: { where?: Partial<Row>; take?: number }) =>
        Promise.resolve(sorted(matches(where)).slice(0, take ?? undefined)),
    ),
    create: jest.fn(({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row = {
        ...data,
        id: nextId++,
        createdAt: new Date((clock += 1000)),
      };
      rows.push(row);
      return Promise.resolve({ id: row.id });
    }),
    deleteMany: jest.fn(({ where }: { where: { id: { in: number[] } } }) => {
      for (const id of where.id.in)
        rows.splice(
          rows.findIndex((r) => r.id === id),
          1,
        );
      return Promise.resolve({ count: where.id.in.length });
    }),
  };
  const client: {
    minigameRecord: typeof minigameRecord;
    $transaction: jest.Mock;
  } = {
    minigameRecord,
    $transaction: jest.fn(
      (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(client),
    ),
  };
  return { client, rows };
}

describe('HU-52: MinigameRecordsService', () => {
  let db: ReturnType<typeof fakePrisma>;
  let service: MinigameRecordsService;

  beforeEach(() => {
    db = fakePrisma();
    service = new MinigameRecordsService(db.client as unknown as PrismaService);
  });

  const jam = (track: string, alias: string, score: number) =>
    service.save({ game: MinigameGame.ARKAD_JAM, track, alias, score });
  const dash = (alias: string, score: number) =>
    service.save({ game: MinigameGame.ARKADASH, alias, score });

  it('guarda el primer puntaje con su puesto y devuelve el top', async () => {
    const result = await dash('  Pixel ', 42);
    expect(result).toMatchObject({
      game: 'ARKADASH',
      track: 'global',
      saved: true,
      position: 1,
    });
    expect(result.top).toEqual([
      expect.objectContaining({
        position: 1,
        alias: 'Pixel',
        score: 42,
        track: 'global',
      }),
    ]);
  });

  it('ordena por puntaje y, en un empate, primero el que llegó antes', async () => {
    await dash('Uno', 10);
    await dash('Dos', 30);
    const tie = await dash('Tres', 10);
    expect(tie.position).toBe(3);
    expect(tie.top.map((r) => [r.position, r.alias])).toEqual([
      [1, 'Dos'],
      [2, 'Uno'],
      [3, 'Tres'],
    ]);
  });

  it('solo conserva los 5 mejores: borra el sexto al entrar uno mejor', async () => {
    for (const [alias, score] of [
      ['Top1', 50],
      ['Top2', 40],
      ['Top3', 30],
      ['Top4', 20],
      ['Top5', 10],
    ] as const) {
      await dash(alias, score);
    }
    const better = await dash('Nuevo', 35);
    expect(better).toMatchObject({ saved: true, position: 3 });
    expect(better.top.map((r) => r.alias)).toEqual([
      'Top1',
      'Top2',
      'Nuevo',
      'Top3',
      'Top4',
    ]);
    expect(db.rows).toHaveLength(5);
    expect(db.rows.find((r) => r.alias === 'Top5')).toBeUndefined();
  });

  it('con el top lleno, un puntaje igual o menor al quinto no se guarda', async () => {
    for (const score of [50, 40, 30, 20, 10]) await dash(`J${score}`, score);
    for (const score of [10, 3]) {
      const result = await dash('Tarde', score);
      expect(result).toMatchObject({ saved: false, position: null });
      expect(result.top).toHaveLength(5);
    }
    expect(db.client.minigameRecord.create).toHaveBeenCalledTimes(5);
  });

  it('Arkad Jam lleva un top por canción, y sin pista el de todas', async () => {
    await jam('guitarra-0', 'Gui', 900);
    await jam('piano-0', 'Pia', 1200);
    await jam('piano-0', 'Pia2', 300);

    const piano = await service.top({
      game: MinigameGame.ARKAD_JAM,
      track: 'piano-0',
    });
    expect(piano.track).toBe('piano-0');
    expect(piano.top.map((r) => r.alias)).toEqual(['Pia', 'Pia2']);

    const all = await service.top({ game: MinigameGame.ARKAD_JAM });
    expect(all.track).toBeNull();
    expect(all.top.map((r) => [r.alias, r.track])).toEqual([
      ['Pia', 'piano-0'],
      ['Gui', 'guitarra-0'],
      ['Pia2', 'piano-0'],
    ]);

    const dashTop = await service.top({ game: MinigameGame.ARKADASH });
    expect(dashTop).toEqual({ game: 'ARKADASH', track: 'global', top: [] });
  });

  it('el top no devuelve el id interno', async () => {
    await dash('Pixel', 5);
    const { top } = await service.top({ game: MinigameGame.ARKADASH });
    expect(Object.keys(top[0]).sort()).toEqual([
      'alias',
      'createdAt',
      'position',
      'score',
      'track',
    ]);
  });

  it.each([
    [{ game: MinigameGame.ARKADASH, alias: 'ab', score: 5 }],
    [{ game: MinigameGame.ARKADASH, alias: 'Pixel', score: 10_001 }],
    [{ game: MinigameGame.ARKAD_JAM, alias: 'Pixel', score: 5 }],
    [
      {
        game: MinigameGame.ARKAD_JAM,
        track: 'piano-1',
        alias: '3001234567',
        score: 5,
      },
    ],
  ])('rechaza %p sin tocar la base', async (dto) => {
    await expect(service.save(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.client.$transaction).not.toHaveBeenCalled();
  });
});
