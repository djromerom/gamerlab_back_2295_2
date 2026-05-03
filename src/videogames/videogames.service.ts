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
import { VideogamesGateway } from './videogames.gateway';
import { Prisma } from '@prisma/client';

@Injectable()
export class VideogamesService {
  private readonly logger = new Logger(VideogamesService.name);
  constructor(
    private prisma: PrismaService,
    private gateway: VideogamesGateway,
  ) {}

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
        _count: {
          select: { likedBy: true },
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
      select: { id: true },
    });

    if (!videogame) {
      throw new NotFoundException(`Videogame with ID ${videogameId} not found`);
    }

    const likes = await this.prisma.videogameLike.count({
      where: { videogameId },
    });

    return { videogameId, likes };
  }

  /**
   * Returns whether the authenticated user has liked the given videogame.
   */
  async getMyLike(
    videogameId: number,
    userId: string,
  ): Promise<{ liked: boolean }> {
    const like = await this.prisma.videogameLike.findUnique({
      where: { videogameId_userId: { videogameId, userId } },
    });
    return { liked: !!like };
  }

  /**
   * Toggle like for an authenticated user on a videogame.
   *
   * - No denormalized counter: the like count is always read via COUNT().
   * - No application-level transaction needed — a single INSERT or DELETE
   *   is atomic by itself.
   * - Unique constraint (P2002) guards against concurrent double-clicks.
   */
  async toggleLike(
    videogameId: number,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const videogame = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
      select: {
        logoUrl: true,
        videoUrl: true,
        additionalImages: true,
        _count: {
          select: { likedBy: true },
        },
      },
    });

    if (!videogame) {
      throw new NotFoundException(`Videogame with ID ${videogameId} not found`);
    }

    // Check whether this user already liked this game
    const existingLike = await this.prisma.videogameLike.findUnique({
      where: { videogameId_userId: { videogameId, userId } },
    });

    const hasContent =
      videogame.videoUrl ||
      (videogame.additionalImages && videogame.additionalImages.length > 0);
    const lacksContentAndLogo = !hasContent && !videogame.logoUrl;

    const currentLikes = videogame._count.likedBy;

    // ── UNLIKE ────────────────────────────────────────────────────────────
    if (existingLike) {
      await this.prisma.videogameLike.delete({
        where: { videogameId_userId: { videogameId, userId } },
      });

      const newCount = currentLikes - 1;
      this.gateway.emitLikesUpdate(videogameId, newCount);
      return { liked: false, likeCount: newCount };
    }

    // ── LIKE ──────────────────────────────────────────────────────────────

    // Enforce content-based caps
    if (lacksContentAndLogo && currentLikes >= this.MAX_LIKES_NO_CONTENT) {
      throw new BadRequestException(
        'This game cannot receive more than 10 likes without any video, photo, or logo.',
      );
    }
    if (!hasContent && currentLikes >= this.MAX_LIKES_LOGO_ONLY) {
      throw new BadRequestException(
        'This game cannot receive more than 20 likes without videos or photos.',
      );
    }

    if (currentLikes >= this.MAX_LIKES) {
      throw new BadRequestException(
        `Likes cannot exceed ${this.MAX_LIKES}`,
      );
    }

    try {
      await this.prisma.videogameLike.create({
        data: { videogameId, userId },
      });

      const newCount = currentLikes + 1;
      this.gateway.emitLikesUpdate(videogameId, newCount);
      return { liked: true, likeCount: newCount };
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