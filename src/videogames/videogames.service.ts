import {
  BadRequestException,
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
      select: {
        likes: true,
      },
    });

    if (!videogame) {
      throw new NotFoundException(`Videogame with ID ${videogameId} not found`);
    }

    return { videogameId, likes: videogame.likes };
  }

  async toggleLike(
    videogameId: number,
    liked: boolean,
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

    // Check if the game has videos or photos
    const hasContent =
      videogame.videoUrl ||
      (videogame.additionalImages && videogame.additionalImages.length > 0);
    const lacksContentAndLogo = !hasContent && !videogame.logoUrl;

    // Enforce like limit for games without content
    if (
      lacksContentAndLogo &&
      liked &&
      videogame.likes >= this.MAX_LIKES_NO_CONTENT
    ) {
      throw new BadRequestException(
        'This game cannot receive more than 10 likes without any video, photo, or logo.',
      );
    }
    if (!hasContent && liked && videogame.likes >= this.MAX_LIKES_LOGO_ONLY) {
      throw new BadRequestException(
        'This game cannot receive more than 20 likes without videos or photos',
      );
    }

    // Increment or decrement likes
    if (liked) {
      await this.prisma.videogame.update({
        where: { id: videogameId },
        data: { likes: { increment: 1 } },
      });
    } else {
      if (videogame.likes > 0) {
        await this.prisma.videogame.update({
          where: { id: videogameId },
          data: { likes: { decrement: 1 } },
        });
      }
    }

    const updatedVideogame = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
      select: { likes: true },
    });

    return { liked, likeCount: updatedVideogame?.likes || 0 };
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
