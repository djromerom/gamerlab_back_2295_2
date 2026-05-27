import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHighlightedGameDto } from './dto/create-highlighted-game.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { HighlightedGame, Videogame } from '@prisma/client';

@Injectable()
export class HighlightedGamesService {
  constructor(private prisma: PrismaService) { }

  async create(editionId: number, createHighlightedGameDto: CreateHighlightedGameDto) {
    const vg = await this.prisma.videogame.findUnique({
      where: { id: createHighlightedGameDto.videogameId }
    });
    
    if (!vg || vg.videogameStatusId !== 1) {
      throw new BadRequestException("Solo se pueden destacar juegos que estén confirmados.");
    }

    return this.prisma.highlightedGame.create({
      data: {
        editionId,
        videogameId: createHighlightedGameDto.videogameId,
      },
    });
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<HighlightedGame & { videogame: Videogame }>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

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
  }

  async remove(editionId: number, videogameId: number) {
    const record = await this.prisma.highlightedGame.findUnique({
      where: {
        editionId_videogameId: {
          editionId,
          videogameId,
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Highlighted game not found for edition #${editionId} and videogame #${videogameId}`);
    }

    return this.prisma.highlightedGame.delete({
      where: {
        editionId_videogameId: {
          editionId,
          videogameId,
        },
      },
    });
  }
}
