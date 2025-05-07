import { Injectable } from '@nestjs/common';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideogamesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVideogameDto) {
    try {
<<<<<<< HEAD
      const { name, description, teamId, logo_url } = dto;
=======
      const { name, description, teamId, logoUrl } = dto;
>>>>>>> dev

      const teamIdInt = parseInt(teamId);

      const existingTeam = await this.prisma.team.findUnique({
        where: { id: teamIdInt },
      });

      if (!existingTeam) {
<<<<<<< HEAD
        throw new Error(`No existe el equipo con ID ${teamId}`);
=======
        throw new Error(`There is no team with ID ${teamId}`);
>>>>>>> dev
      }

      const existingGame = await this.prisma.videogame.findUnique({
        where: { teamId: teamIdInt },
      });

      if (existingGame) {
<<<<<<< HEAD
        throw new Error(`Este equipo ya tiene un videojuego registrado.`);
      }

      const estado = await this.prisma.estado_videojuego.findFirst({
        where: { estado: 'pendiente' },
      });

      if (!estado) {
        throw new Error('No se encontró el estado inicial para el videojuego.');
      }

      console.log(dto);

=======
        throw new Error(`This team already has a registered videogame.`);
      }

>>>>>>> dev
      return await this.prisma.videogame.create({
        data: {
          name,
          description,
<<<<<<< HEAD
          logo_url: logo_url || '',
          id_estado_videojuego: estado.id_estado,
          teamId: teamIdInt,
        },
      });

=======
          logoUrl: logoUrl || '',
          teamId: teamIdInt,
        },
      });
>>>>>>> dev
    } catch (error) {
      console.error('Error al crear videojuego:', error);
      throw error;
    }
  }
<<<<<<< HEAD
=======

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
>>>>>>> dev
}
