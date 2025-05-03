import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVideogameDto } from './../dto/create-videogame.dto';

@Injectable()
export class VideogameService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVideogameDto) {
    const estadoPendiente = await this.prisma.estado_videojuego.findFirst({
      where: { estado: 'pendiente' },
    });

    if (!estadoPendiente) {
      throw new Error('No se encontró el estado inicial del videojuego.');
    }

    const newGame = await this.prisma.videogame.create({
      data: {
        name: dto.name,
        description: dto.description,
        logo_url: dto.logoUrl || '',
        id_estado_videojuego: estadoPendiente.id_estado,
        teamId: typeof dto.teamId === 'string' ? parseInt(dto.teamId) : dto.teamId,
      },
    });

    return newGame;
  }
}
