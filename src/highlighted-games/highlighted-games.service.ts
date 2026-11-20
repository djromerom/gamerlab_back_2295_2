import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { CreateHighlightedGameDto } from './dto/create-highlighted-game.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { HighlightedGame, Prisma, Videogame } from '@prisma/client';
import { PublicHighlightedGame } from './types/public-highlighted-game.type';

// HU-41 (ARK-229): campos del listado público. Selección explícita: sin integrantes ni datos personales.
const PUBLIC_GAME_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
  gameFileUrl: true,
} as const;
const PUBLIC_HIGHLIGHT_SELECT = {
  id: true,
  edition: { select: { id: true, year: true, semester: true, title: true } },
  videogame: {
    select: { ...PUBLIC_GAME_SELECT, team: { select: { teamName: true } } },
  },
  historicalVideogame: {
    select: {
      ...PUBLIC_GAME_SELECT,
      historicalTeam: { select: { teamName: true } },
    },
  },
} satisfies Prisma.HighlightedGameSelect;

type PublicHighlightRow = Prisma.HighlightedGameGetPayload<{
  select: typeof PUBLIC_HIGHLIGHT_SELECT;
}>;

/** Edición más reciente primero (año y semestre descendentes) y, dentro de cada edición, por nombre. */
function comparePublicHighlightedGames(
  a: PublicHighlightedGame,
  b: PublicHighlightedGame,
): number {
  return (
    b.edition.year - a.edition.year ||
    b.edition.semester - a.edition.semester ||
    b.edition.id - a.edition.id ||
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) ||
    a.id - b.id
  );
}

@Injectable()
export class HighlightedGamesService {

  private readonly logger = new Logger(HighlightedGamesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly blobRefs: BlobReferenceService,
  ) { }

  async create(
    editionId: number,
    createHighlightedGameDto: CreateHighlightedGameDto,
  ) {
    const { videogameId, historicalVideogameId } = createHighlightedGameDto;

    // HU-41 (ARK-229): un destacado es de un juego en vivo O de uno histórico, nunca de los dos.
    if ((videogameId == null) === (historicalVideogameId == null)) {
      throw new BadRequestException(
        'Envía exactamente uno de estos campos: videogameId o historicalVideogameId.',
      );
    }

    const target =
      videogameId != null
        ? `videogame #${videogameId}`
        : `historical videogame #${historicalVideogameId}`;
    this.logger.log(
      `Attempting to highlight ${target} in edition #${editionId}`,
    );

    let data: Prisma.HighlightedGameUncheckedCreateInput;
    if (videogameId != null) {
      const vg = await this.prisma.videogame.findUnique({
        where: { id: videogameId },
      });

      if (!vg || vg.videogameStatusId !== 1) {
        this.logger.warn(
          `Cannot highlight videogame #${videogameId} in edition #${editionId}: videogame not found or not confirmed (statusId=${vg?.videogameStatusId ?? 'N/A'})`,
        );
        throw new BadRequestException(
          'Solo se pueden destacar juegos que estén confirmados.',
        );
      }
      data = { editionId, videogameId };
    } else {
      const historical = await this.prisma.historicalVideogame.findUnique({
        where: { id: historicalVideogameId },
        select: { id: true, historicalTeam: { select: { editionId: true } } },
      });

      if (!historical || historical.historicalTeam.editionId !== editionId) {
        this.logger.warn(
          `Cannot highlight historical videogame #${historicalVideogameId} in edition #${editionId}: not found or from another edition (editionId=${historical?.historicalTeam.editionId ?? 'N/A'})`,
        );
        throw new BadRequestException(
          'El juego histórico no existe o no pertenece a esta edición.',
        );
      }
      data = { editionId, historicalVideogameId };
    }

    try {
      const result = await this.prisma.highlightedGame.create({ data });
      this.logger.log(
        `${target} highlighted successfully in edition #${editionId}`,
      );
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `${target} is already highlighted in edition #${editionId}`,
        );
        throw new ConflictException(
          'Este juego ya está destacado en esta edición.',
        );
      }
      this.logger.error(
        `Error highlighting ${target} in edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al destacar el videojuego.');
    }
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<HighlightedGame & { videogame: Videogame }>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    this.logger.log(`Fetching highlighted games for edition #${editionId} — page ${page}, limit ${limit}`);

    // HU-41 (ARK-229): este listado (lo leen /informacion y «Ferias pasadas» con item.videogame.*)
    // solo devuelve destacados de juegos en vivo; los históricos salen en GET /highlighted-games.
    const where = { editionId, videogameId: { not: null } };

    try {
      const [rows, totalItems] = await this.prisma.$transaction([
        this.prisma.highlightedGame.findMany({
          where,
          skip: offset,
          take: limit,
          include: {
            videogame: true
          },
        }),
        this.prisma.highlightedGame.count({
          where,
        }),
      ]);
      // El filtro garantiza que cada destacado trae su videojuego en vivo.
      const items = rows as (HighlightedGame & { videogame: Videogame })[];

      const totalPages = Math.ceil(totalItems / limit);

      this.logger.log(`Found ${items.length} highlighted games (total: ${totalItems}, pages: ${totalPages}) for edition #${editionId}`);

      await this.blobRefs.resolveInPlace(items.map((i) => i.videogame).filter(Boolean));

      return {
        data: items,
        metadata: {
          totalItems,
          itemsOnCurrentPage: items.length,
          currentPage: page,
          itemsPerPage: limit,
          totalPages,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching highlighted games for edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al obtener los juegos destacados.');
    }
  }

  async remove(editionId: number, videogameId: number) {
    this.logger.log(`Removing highlighted game — videogame #${videogameId} from edition #${editionId}`);

    const record = await this.prisma.highlightedGame.findUnique({
      where: {
        editionId_videogameId: {
          editionId,
          videogameId,
        },
      },
    });

    if (!record) {
      this.logger.warn(`Highlighted game not found for edition #${editionId} and videogame #${videogameId}`);
      throw new NotFoundException(`Highlighted game not found for edition #${editionId} and videogame #${videogameId}`);
    }

    try {
      await this.prisma.highlightedGame.delete({
        where: {
          editionId_videogameId: {
            editionId,
            videogameId,
          },
        },
      });
      this.logger.log(`Highlighted game removed — videogame #${videogameId} from edition #${editionId}`);
    } catch (error) {
      this.logger.error(
        `Error removing highlighted game — videogame #${videogameId} from edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al eliminar el juego destacado.');
    }
  }

  /** HU-41 (ARK-229): quita el destacado de un juego histórico de la edición. */
  async removeHistorical(editionId: number, historicalVideogameId: number) {
    this.logger.log(
      `Removing highlighted game — historical videogame #${historicalVideogameId} from edition #${editionId}`,
    );

    const record = await this.prisma.highlightedGame.findUnique({
      where: {
        editionId_historicalVideogameId: { editionId, historicalVideogameId },
      },
      select: { id: true },
    });

    if (!record) {
      this.logger.warn(
        `Highlighted game not found for edition #${editionId} and historical videogame #${historicalVideogameId}`,
      );
      throw new NotFoundException(
        `No hay un juego histórico #${historicalVideogameId} destacado en la edición #${editionId}.`,
      );
    }

    try {
      await this.prisma.highlightedGame.delete({ where: { id: record.id } });
      this.logger.log(
        `Highlighted game removed — historical videogame #${historicalVideogameId} from edition #${editionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error removing highlighted game — historical videogame #${historicalVideogameId} from edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Error interno al eliminar el juego destacado.',
      );
    }
  }

  /**
   * HU-41 (ARK-229): destacados para la landing (GET /highlighted-games), en vivo e históricos.
   * Sin editionId devuelve los de todas las ediciones. Lista plana, sin paginar.
   */
  async findPublic(editionId?: number): Promise<PublicHighlightedGame[]> {
    this.logger.log(
      `Fetching public highlighted games${editionId === undefined ? '' : ` for edition #${editionId}`}`,
    );

    try {
      const rows = await this.prisma.highlightedGame.findMany({
        where: editionId === undefined ? {} : { editionId },
        select: PUBLIC_HIGHLIGHT_SELECT,
      });

      const games = await Promise.all(
        rows.map((row) => this.toPublicHighlightedGame(row)),
      );
      return games
        .filter((game): game is PublicHighlightedGame => game !== null)
        .sort(comparePublicHighlightedGames);
    } catch (error) {
      this.logger.error(
        `Error fetching public highlighted games: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Error interno al obtener los juegos destacados.',
      );
    }
  }

  private async toPublicHighlightedGame(
    row: PublicHighlightRow,
  ): Promise<PublicHighlightedGame | null> {
    const live = row.videogame;
    const historical = row.historicalVideogame;
    // El CHECK de la tabla garantiza uno de los dos; si no, la fila se omite.
    const source = live
      ? { game: live, teamName: live.team.teamName, type: 'live' as const }
      : historical
        ? {
            game: historical,
            teamName: historical.historicalTeam.teamName,
            type: 'historical' as const,
          }
        : null;
    if (!source) return null;

    const { game, teamName, type } = source;
    const logoUrl = await this.blobRefs.resolve(game.logoUrl);
    return {
      id: row.id,
      name: game.name,
      teamName,
      edition: row.edition,
      logoUrl: logoUrl ?? null,
      hasGameFile: !!game.gameFileUrl?.trim(),
      play: { type, id: game.id },
    };
  }
}
