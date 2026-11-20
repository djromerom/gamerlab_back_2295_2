import { Injectable, NotFoundException } from '@nestjs/common';
import { MinigameGame, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMinigameRecordDto } from './dto/create-minigame-record.dto';
import { ListMinigameRecordsDto } from './dto/list-minigame-records.dto';
import {
  MINIGAME_RECORD_NOT_FOUND,
  TOP_SIZE,
  assertPossibleScore,
  normalizeAlias,
  normalizeTrack,
} from './minigame-record-rules';

export interface MinigameRecordRow {
  /** Solo para el Administrador, que lo usa para borrar el récord (DELETE /minigame-records/:id). */
  id?: number;
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

  /** `withIds`: solo el Administrador recibe el id de cada récord. */
  async top(
    query: ListMinigameRecordsDto,
    withIds = false,
  ): Promise<MinigameTop> {
    const allSongs =
      query.game === MinigameGame.ARKAD_JAM && !query.track?.trim();
    const track = allSongs ? null : normalizeTrack(query.game, query.track);
    const rows = await this.prisma.minigameRecord.findMany({
      where: { game: query.game, ...(track ? { track } : {}) },
      orderBy: TOP_ORDER,
      take: TOP_SIZE,
      select: ROW_SELECT,
    });
    return { game: query.game, track, top: this.rank(rows, withIds) };
  }

  /**
   * Borra un récord (un alias grosero o un puntaje falso). Solo el Administrador. Devuelve el top
   * de esa pista ya sin él: los demás suben un puesto. Como solo se guardan los 5 mejores, el top
   * queda con uno menos hasta que entre otro puntaje.
   */
  async remove(id: number): Promise<MinigameTop> {
    const record = await this.prisma.minigameRecord.findUnique({
      where: { id },
      select: { game: true, track: true },
    });
    if (!record) {
      throw new NotFoundException({
        statusCode: 404,
        code: MINIGAME_RECORD_NOT_FOUND,
        message: 'Ese récord no existe o ya se borró',
      });
    }
    // deleteMany: si otro administrador lo borró al mismo tiempo, no falla.
    await this.prisma.minigameRecord.deleteMany({ where: { id } });
    const rows = await this.prisma.minigameRecord.findMany({
      where: record,
      orderBy: TOP_ORDER,
      take: TOP_SIZE,
      select: ROW_SELECT,
    });
    return {
      game: record.game,
      track: record.track,
      top: this.rank(rows, true),
    };
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

  private rank(rows: StoredRow[], withIds = false): MinigameRecordRow[] {
    return rows.map((row, index) => ({
      ...(withIds ? { id: row.id } : {}),
      position: index + 1,
      alias: row.alias,
      score: row.score,
      track: row.track,
      createdAt: row.createdAt,
    }));
  }
}
