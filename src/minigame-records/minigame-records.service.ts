import { Injectable } from '@nestjs/common';
import { MinigameGame, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMinigameRecordDto } from './dto/create-minigame-record.dto';
import { ListMinigameRecordsDto } from './dto/list-minigame-records.dto';
import {
  TOP_SIZE,
  assertPossibleScore,
  normalizeAlias,
  normalizeTrack,
} from './minigame-record-rules';

export interface MinigameRecordRow {
  position: number;
  alias: string;
  score: number;
  track: string;
  createdAt: Date;
}

export interface MinigameTop {
  game: MinigameGame;
  /** null: top de todas las canciones de Arkad Jam. */
  track: string | null;
  top: MinigameRecordRow[];
}

export interface SavedMinigameRecord extends MinigameTop {
  /** false: el puntaje no superó el top y no se guardó. */
  saved: boolean;
  /** Puesto del puntaje en el top, o null si no entró. */
  position: number | null;
}

// Mayor puntaje primero; en un empate va primero el que llegó antes.
const TOP_ORDER: Prisma.MinigameRecordOrderByWithRelationInput[] = [
  { score: 'desc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

const ROW_SELECT = {
  id: true,
  alias: true,
  score: true,
  track: true,
  createdAt: true,
} satisfies Prisma.MinigameRecordSelect;

type StoredRow = Prisma.MinigameRecordGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * HU-52 (ARK-315): récords globales de Arkadash y Arkad Jam. Solo se guardan los TOP_SIZE
 * mejores de cada pista; el resto se borra al entrar uno nuevo, así la tabla no crece.
 * No se guarda la IP ni ningún dato de quien juega: solo el alias.
 */
@Injectable()
export class MinigameRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async top(query: ListMinigameRecordsDto): Promise<MinigameTop> {
    const allSongs =
      query.game === MinigameGame.ARKAD_JAM && !query.track?.trim();
    const track = allSongs ? null : normalizeTrack(query.game, query.track);
    const rows = await this.prisma.minigameRecord.findMany({
      where: { game: query.game, ...(track ? { track } : {}) },
      orderBy: TOP_ORDER,
      take: TOP_SIZE,
      select: ROW_SELECT,
    });
    return { game: query.game, track, top: this.rank(rows) };
  }

  async save(dto: CreateMinigameRecordDto): Promise<SavedMinigameRecord> {
    const track = normalizeTrack(dto.game, dto.track);
    const alias = normalizeAlias(dto.alias);
    assertPossibleScore(dto.game, dto.score);
    const where = { game: dto.game, track };

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.minigameRecord.findMany({
        where,
        orderBy: TOP_ORDER,
        take: TOP_SIZE,
        select: ROW_SELECT,
      });
      const last = current[TOP_SIZE - 1];
      if (current.length >= TOP_SIZE && dto.score <= last.score) {
        return {
          game: dto.game,
          track,
          saved: false,
          position: null,
          top: this.rank(current),
        };
      }

      const created = await tx.minigameRecord.create({
        data: { ...where, alias, score: dto.score },
        select: { id: true },
      });
      const rows = await tx.minigameRecord.findMany({
        where,
        orderBy: TOP_ORDER,
        select: ROW_SELECT,
      });
      const kept = rows.slice(0, TOP_SIZE);
      const dropped = rows.slice(TOP_SIZE).map((row) => row.id);
      if (dropped.length) {
        await tx.minigameRecord.deleteMany({ where: { id: { in: dropped } } });
      }
      const index = kept.findIndex((row) => row.id === created.id);
      return {
        game: dto.game,
        track,
        saved: index >= 0,
        position: index >= 0 ? index + 1 : null,
        top: this.rank(kept),
      };
    });
  }

  private rank(rows: StoredRow[]): MinigameRecordRow[] {
    return rows.map((row, index) => ({
      position: index + 1,
      alias: row.alias,
      score: row.score,
      track: row.track,
      createdAt: row.createdAt,
    }));
  }
}
