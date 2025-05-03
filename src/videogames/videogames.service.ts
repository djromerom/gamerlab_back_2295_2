import { Injectable } from '@nestjs/common';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideogamesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVideogameDto) {
    try {
      const { name, description, teamId, logo_url } = dto;

      const teamIdInt = parseInt(teamId);

      const existingTeam = await this.prisma.team.findUnique({
        where: { id: teamIdInt },
      });

      if (!existingTeam) {
        throw new Error(`No existe el equipo con ID ${teamId}`);
      }

      const existingGame = await this.prisma.videogame.findUnique({
        where: { teamId: teamIdInt },
      });

      if (existingGame) {
        throw new Error(`Este equipo ya tiene un videojuego registrado.`);
      }

      const estado = await this.prisma.estado_videojuego.findFirst({
        where: { estado: 'pendiente' },
      });

      if (!estado) {
        throw new Error('No se encontró el estado inicial para el videojuego.');
      }

      console.log(dto);

      return await this.prisma.videogame.create({
        data: {
          name,
          description,
          logo_url: logo_url || '',
          id_estado_videojuego: estado.id_estado,
          teamId: teamIdInt,
        },
      });

    } catch (error) {
      console.error('Error al crear videojuego:', error);
      throw error;
    }
  }
}
