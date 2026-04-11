import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
 
@Injectable()
export class VideogamesService {
  private readonly logger = new Logger(VideogamesService.name);
  constructor(private prisma: PrismaService) {}
 
  private readonly MAX_LIKES_LOGO_ONLY = 20;
  private readonly MAX_LIKES_NO_CONTENT = 10;
  private readonly MAX_LIKES = 999999;
 
  async create(dto: CreateVideogameDto) {
    throw new NotImplementedException('Method create not implemented yet');
  }
 
  async findAll() {
    const videogames = await this.prisma.videogame.findMany({
      include: {
        team: {
          select: {
            teamName: true,
            members: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        videogameStatus: {
          select: {
            status: true,
          },
        },
      },
    });
 
    return videogames.map((vg) => ({
      id: vg.id,
      name: vg.name,
      descripcion: vg.description,
      logoUrl: vg.logoUrl,
      videoUrl: vg.videoUrl,
      repoUrl: vg.repoUrl,
      additionalImages: vg.additionalImages,
      teamName: vg.team.teamName,
      status: vg.videogameStatus.status,
      members: vg.team.members.map((m) => `${m.firstName} ${m.lastName}`),
    }));
  }
 
  async getLikes(videogameId: number) {
    const videogame = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
      select: { likes: true },
    });
 
    if (!videogame) {
      throw new NotFoundException(`Videogame with ID ${videogameId} not found`);
    }
 
    return { videogameId, likes: videogame.likes };
  }
 
  /**
   * Toggle like for a visitor on a videogame.
   *
   * CHANGES vs original:
   * 1. `liked: boolean` param removed — the server decides based on DB state,
   *    not the client. Prevents client-side manipulation / desync.
   * 2. `visitorId: string` added — tracks who liked to prevent duplicates.
   * 3. Increment/decrement runs inside a $transaction — atomic, no race condition.
   * 4. Unique constraint (P2002) caught at DB level for concurrent double-clicks.
   * 5. Math.max(0, ...) guard ensures counter never goes negative.
   * 6. Removed redundant second findUnique — update() returns the new value directly.
   */
  async toggleLike(
    videogameId: number,
    visitorId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const videogame = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
      select: {
        likes: true,
        logoUrl: true,
        videoUrl: true,
        additionalImages: true,
      },
    });
 
    if (!videogame) {
      throw new NotFoundException(`Videogame with ID ${videogameId} not found`);
    }
 
    // Check whether this visitor already liked this game
    const existingLike = await this.prisma.videogameLike.findUnique({
      where: {
        videogameId_visitorId: { videogameId, visitorId },
      },
    });
 
    const hasContent =
      videogame.videoUrl ||
      (videogame.additionalImages && videogame.additionalImages.length > 0);
    const lacksContentAndLogo = !hasContent && !videogame.logoUrl;
 
    // ── UNLIKE ────────────────────────────────────────────────────────────
    if (existingLike) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.videogameLike.delete({
          where: { videogameId_visitorId: { videogameId, visitorId } },
        }),
        this.prisma.videogame.update({
          where: { id: videogameId },
          data: { likes: { decrement: 1 } },
          select: { likes: true },
        }),
      ]);
 
      // Safety net: correct if counter somehow went negative
      const safeCount = Math.max(0, updated.likes);
      if (updated.likes < 0) {
        await this.prisma.videogame.update({
          where: { id: videogameId },
          data: { likes: 0 },
        });
      }
 
      return { liked: false, likeCount: safeCount };
    }
 
    // ── LIKE ──────────────────────────────────────────────────────────────
 
    // Enforce content-based caps
    if (lacksContentAndLogo && videogame.likes >= this.MAX_LIKES_NO_CONTENT) {
      throw new BadRequestException(
        'This game cannot receive more than 10 likes without any video, photo, or logo.',
      );
    }
    if (!hasContent && videogame.likes >= this.MAX_LIKES_LOGO_ONLY) {
      throw new BadRequestException(
        'This game cannot receive more than 20 likes without videos or photos.',
      );
    }
 
    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.videogameLike.create({
          data: { videogameId, visitorId },
        }),
        this.prisma.videogame.update({
          where: { id: videogameId },
          data: { likes: { increment: 1 } },
          select: { likes: true },
        }),
      ]);
 
      return { liked: true, likeCount: updated.likes };
    } catch (error) {
      // Two simultaneous requests passed findUnique check — DB unique constraint wins
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already liked this game.');
      }
      throw error;
    }
  }
 
  async setLikes(videogameId: number, likes: number) {
    this.logger.log(`Admin set likes for videogame ${videogameId} to ${likes}`);
 
    if (likes < 0) {
      throw new BadRequestException('Likes cannot be negative');
    }
    if (likes > this.MAX_LIKES) {
      throw new BadRequestException('Likes cannot exceed 999,999');
    }
 
    try {
      const videogame = await this.prisma.videogame.update({
        where: { id: videogameId },
        data: { likes },
        select: { likes: true },
      });
 
      return { videogameId, likeCount: videogame.likes };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          `Videogame with ID ${videogameId} not found`,
        );
      }
      throw error;
    }
  }
 
  async findOne(videogameId: number) {
    throw new NotImplementedException('Method findOne not implemented yet');
  }
 
  async update(videogameId: number, videogameData: UpdateVideogameDto) {
    throw new NotImplementedException('Method update not implemented yet');
  }
 
  async remove(videogameId: number) {
    throw new NotImplementedException('Method delete not implemented yet');
  }
}