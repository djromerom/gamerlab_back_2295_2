import { Injectable } from '@nestjs/common';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideogamesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVideogameDto) {
    try {
      const { name, description, teamId, logoUrl } = dto;

      const teamIdInt = parseInt(teamId);

      const existingTeam = await this.prisma.team.findUnique({
        where: { id: teamIdInt },
      });

      if (!existingTeam) {
        throw new Error(`There is no team with ID ${teamId}`);
      }

      const existingGame = await this.prisma.videogame.findUnique({
        where: { teamId: teamIdInt },
      });

      if (existingGame) {
        throw new Error(`This team already has a registered videogame.`);
      }

      return await this.prisma.videogame.create({
        data: {
          name,
          description,
          logoUrl: logoUrl || '',
          teamId: teamIdInt,
        },
      });
    } catch (error) {
      console.error('Error al crear videojuego:', error);
      throw error;
    }
  }

  async findAll() {
    return 'This action returns all videogames';
  }

  async findOne(id: string) {
    return 'This action returns a single videogame';
  }

  async update(id: string, dto: UpdateVideogameDto) {
    return 'This action updates a videogame';
  }

  async remove(id: string) {
    return 'This action removes a videogame';
  }
}
