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
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2

      const teamIdInt = parseInt(teamId);

      const existingTeam = await this.prisma.team.findUnique({
        where: { id: teamIdInt },
      });

      if (!existingTeam) {
<<<<<<< HEAD
        throw new Error(`No existe el equipo con ID ${teamId}`);
=======
        throw new Error(`There is no team with ID ${teamId}`);
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
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

>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
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
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
    } catch (error) {
      console.error('Error al crear videojuego:', error);
      throw error;
    }
  }

  async findAll() {
<<<<<<< HEAD
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
=======
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
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
  }
}
