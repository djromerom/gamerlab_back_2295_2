import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideogamesService {
  constructor(private prisma: PrismaService) {}

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

  async toggleLike(videogameId: number, liked: boolean) : Promise<{ liked: boolean, likeCount: number }> {
    if (liked) {
      await this.prisma.videogame.update({
        where: { id: videogameId },
        data: {
          likes: {
            increment: 1,
          },
        },
      });
    } else {
      await this.prisma.videogame.update({
        where: { id: videogameId },
        data: {
          likes: {
            decrement: 1,
          },
        },
      });
    }

    const updatedVideogame = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
      select: { likes: true },
    });

    return { liked, likeCount: updatedVideogame?.likes || 0 };
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
