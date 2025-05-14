import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideogamesService {
  constructor(private prisma: PrismaService) { }

  async create(dto: CreateVideogameDto) {
    throw new NotImplementedException('Method create not implemented yet');
  }

  async findAll() {
    const videogames = await this.prisma.videogame.findMany({
      include: {
        team: {
          select: {
            teamName: true,
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
      name: vg.name,
      logoUrl: vg.logoUrl,
      teamName: vg.team.teamName,
      status: vg.videogameStatus.status,
    }));
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
