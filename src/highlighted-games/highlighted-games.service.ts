import { Injectable, NotFoundException, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { CreateHighlightedGameDto } from './dto/create-highlighted-game.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { HighlightedGame, Videogame } from '@prisma/client';

@Injectable()
export class HighlightedGamesService {

  private readonly logger = new Logger(HighlightedGamesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly blobRefs: BlobReferenceService,
  ) { }

  async create(editionId: number, createHighlightedGameDto: CreateHighlightedGameDto) {
    const { videogameId } = createHighlightedGameDto;
    this.logger.log(`Attempting to highlight videogame #${videogameId} in edition #${editionId}`);

    const vg = await this.prisma.videogame.findUnique({
      where: { id: videogameId }
    });

    if (!vg || vg.videogameStatusId !== 1) {
      this.logger.warn(
        `Cannot highlight videogame #${videogameId} in edition #${editionId}: videogame not found or not confirmed (statusId=${vg?.videogameStatusId ?? 'N/A'})`,
      );
      throw new BadRequestException("Solo se pueden destacar juegos que estén confirmados.");
    }

    try {
      const result = await this.prisma.highlightedGame.create({
        data: {
          editionId,
          videogameId,
        },
      });
      this.logger.log(`Videogame #${videogameId} highlighted successfully in edition #${editionId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error highlighting videogame #${videogameId} in edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al destacar el videojuego.');
    }
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<HighlightedGame & { videogame: Videogame }>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    this.logger.log(`Fetching highlighted games for edition #${editionId} — page ${page}, limit ${limit}`);

    try {
      const [items, totalItems] = await this.prisma.$transaction([
        this.prisma.highlightedGame.findMany({
          where: { editionId },
          skip: offset,
          take: limit,
          include: {
            videogame: true
          },
        }),
        this.prisma.highlightedGame.count({
          where: { editionId },
        }),
      ]);

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
}
