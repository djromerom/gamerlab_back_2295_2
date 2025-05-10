import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Injectable()
export class VideogamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllVideogamesWithDetails(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: VideogameResponseDto[]; metadata: any }> {
    const offset = (page - 1) * limit;

    // Obtener los IDs de los videojuegos que ya están en la tabla "evaluacion"
    const evaluatedVideogameIds = await this.prisma.evaluation.findMany({
      select: {
        videogameId: true,
      },
    }).then((evaluations) => evaluations.map((evaluation) => evaluation.videogameId));

    // Obtener todos los videojuegos con paginación
    const [videogames, totalItems] = await this.prisma.$transaction([
      this.prisma.videogame.findMany({
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          logoUrl: true,
          description: true,
          team: {
            select: {
              teamName: true,
              members: {
                select: {
                  firstName: true,
                  lastName: true,
                  nrcs: {
                    select: {
                      code: true,
                      subject: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.videogame.count(), // Contar el total de videojuegos
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    // Mapear los videojuegos y agregar el indicador "isEvaluated"
    const data = videogames.map((videogame) => ({
      videogameId: videogame.id,
      videogameName: videogame.name,
      logoUrl: videogame.logoUrl,
      descripcion: videogame.description || 'Sin descripción',
      teamName: videogame.team?.teamName || 'Sin equipo',
      members: videogame.team?.members?.map((member) => ({
        fullName: `${member.firstName} ${member.lastName}`,
      })) || [],
      nrc: videogame.team?.members?.[0]?.nrcs?.[0]?.code || 'Sin NRC',
      subject: videogame.team?.members?.[0]?.nrcs?.[0]?.subject?.name || 'Sin materia',
      isEvaluated: evaluatedVideogameIds.includes(videogame.id),
    }));

    return {
      data,
      metadata: {
        totalItems,
        itemsOnCurrentPage: data.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
      },
    };
  }
}