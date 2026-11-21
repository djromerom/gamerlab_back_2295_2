import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    findUnique: jest.fn(({ where }: { where: { id: number } }) => {
      const row = rows.find((r) => r.id === where.id);
      return Promise.resolve(row ? { game: row.game, track: row.track } : null);
    }),
    deleteMany: jest.fn(
      ({ where }: { where: { id: number | { in: number[] } } }) => {
        const ids = typeof where.id === 'number' ? [where.id] : where.id.in;
        let count = 0;
        for (const id of ids) {
          const index = rows.findIndex((r) => r.id === id);
          if (index >= 0) {
            rows.splice(index, 1);
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    ),
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
    const result = await dash('  PIX ', 42);
    expect(result).toMatchObject({
      game: 'ARKADASH',
      track: 'global',
      saved: true,
      position: 1,
    });
    expect(result.top).toEqual([
      expect.objectContaining({
        position: 1,
        alias: 'PIX',
        score: 42,
        track: 'global',
      }),
    ]);
  });

  it('ordena por puntaje y, en un empate, primero el que llegó antes', async () => {
    await dash('UNO', 10);
    await dash('DOS', 30);
    const tie = await dash('TRE', 10);
    expect(tie.position).toBe(3);
    expect(tie.top.map((r) => [r.position, r.alias])).toEqual([
      [1, 'DOS'],
      [2, 'UNO'],
      [3, 'TRE'],
    ]);
  });

  it('solo conserva los 5 mejores: borra el sexto al entrar uno mejor', async () => {
    for (const [alias, score] of [
      ['TP1', 50],
      ['TP2', 40],
      ['TP3', 30],
      ['TP4', 20],
      ['TP5', 10],
    ] as const) {
      await dash(alias, score);
    }
    const better = await dash('NEW', 35);
    expect(better).toMatchObject({ saved: true, position: 3 });
    expect(better.top.map((r) => r.alias)).toEqual([
      'TP1',
      'TP2',
      'NEW',
      'TP3',
      'TP4',
    ]);
    expect(db.rows).toHaveLength(5);
    expect(db.rows.find((r) => r.alias === 'TP5')).toBeUndefined();
  });

  it('con el top lleno, un puntaje igual o menor al quinto no se guarda', async () => {
    for (const score of [50, 40, 30, 20, 10]) await dash(`J${score}`, score);
    for (const score of [10, 3]) {
      const result = await dash('TAR', score);
      expect(result).toMatchObject({ saved: false, position: null });
      expect(result.top).toHaveLength(5);
    }
    expect(db.client.minigameRecord.create).toHaveBeenCalledTimes(5);
  });

  it('Arkad Jam lleva un top por canción, y sin pista el de todas', async () => {
    await jam('guitarra-0', 'Gui', 900);
    await jam('piano-0', 'Pia', 1200);
    await jam('piano-0', 'PI2', 300);

    const piano = await service.top({
      game: MinigameGame.ARKAD_JAM,
      track: 'piano-0',
    });
    expect(piano.track).toBe('piano-0');
    expect(piano.top.map((r) => r.alias)).toEqual(['Pia', 'PI2']);

    const all = await service.top({ game: MinigameGame.ARKAD_JAM });
    expect(all.track).toBeNull();
    expect(all.top.map((r) => [r.alias, r.track])).toEqual([
      ['Pia', 'piano-0'],
      ['Gui', 'guitarra-0'],
      ['PI2', 'piano-0'],
    ]);

    const dashTop = await service.top({ game: MinigameGame.ARKADASH });
    expect(dashTop).toEqual({ game: 'ARKADASH', track: 'global', top: [] });
  });

  it('el top no devuelve el id interno', async () => {
    await dash('PIX', 5);
    const { top } = await service.top({ game: MinigameGame.ARKADASH });
    expect(Object.keys(top[0]).sort()).toEqual([
      'alias',
      'createdAt',
      'position',
      'score',
      'track',
    ]);
  });

  it('el Administrador recibe el id de cada récord para poder borrarlo', async () => {
    await dash('PIX', 5);
    const { top } = await service.top({ game: MinigameGame.ARKADASH }, true);
    expect(typeof top[0].id).toBe('number');
    expect(top[0].alias).toBe('PIX');
  });

  describe('borrar un récord (solo Administrador)', () => {
    it('lo borra y devuelve el top de esa pista recalculado, con ids', async () => {
      for (const [alias, score] of [
        ['TP1', 50],
        ['GRO', 40],
        ['TP3', 30],
        ['TP4', 20],
        ['TP5', 10],
      ] as const) {
        await dash(alias, score);
      }
      await jam('piano-0', 'OTR', 99);
      const id = db.rows.find((r) => r.alias === 'GRO')!.id;

      const result = await service.remove(id);

      expect(result.game).toBe('ARKADASH');
      expect(result.track).toBe('global');
      expect(result.top.map((r) => [r.position, r.alias])).toEqual([
        [1, 'TP1'],
        [2, 'TP3'],
        [3, 'TP4'],
        [4, 'TP5'],
      ]);
      expect(result.top.every((r) => typeof r.id === 'number')).toBe(true);
      // La otra pista no se toca.
      expect(db.rows.map((r) => r.alias)).toContain('OTR');
      const after = await service.top({ game: MinigameGame.ARKADASH });
      expect(after.top.map((r) => r.alias)).not.toContain('GRO');
    });

    it('responde 404 con su code si el récord no existe', async () => {
      const error = await service.remove(999).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'MINIGAME_RECORD_NOT_FOUND',
      });
      expect(db.client.minigameRecord.deleteMany).not.toHaveBeenCalled();
    });
  });

  it.each([
    [{ game: MinigameGame.ARKADASH, alias: 'PTA', score: 5 }],
    [{ game: MinigameGame.ARKADASH, alias: 'abcd', score: 5 }],
    [{ game: MinigameGame.ARKADASH, alias: 'PIX', score: 10_001 }],
    [{ game: MinigameGame.ARKAD_JAM, alias: 'PIX', score: 5 }],
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
