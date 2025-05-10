import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Injectable()
export class VideogamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllVideogamesWithDetails(): Promise<VideogameResponseDto[]> {
    // Obtener los IDs de los videojuegos que ya están en la tabla "evaluacion"
    const evaluatedVideogameIds = await this.prisma.evaluation.findMany({
      select: {
        videogameId: true, // Asegúrate de que "videogameId" sea el nombre correcto del campo en la tabla "evaluacion"
      },
    }).then((evaluations) => evaluations.map((evaluation) => evaluation.videogameId));
  
    // Obtener todos los videojuegos
    const videogames = await this.prisma.videogame.findMany({
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
    });
  
    // Mapear los videojuegos y agregar el indicador "isEvaluated"
    return videogames.map((videogame) => ({
      videogameId: videogame.id,
      videogameName: videogame.name,
      logoUrl: videogame.logoUrl,
      descripcion: videogame.description || "Sin descripción",
      teamName: videogame.team?.teamName || "Sin equipo",
      members: videogame.team?.members?.map((member) => ({
        fullName: `${member.firstName} ${member.lastName}`,
      })) || [],
      nrc: videogame.team?.members?.[0]?.nrcs?.[0]?.code || "Sin NRC",
      subject: videogame.team?.members?.[0]?.nrcs?.[0]?.subject?.name || "Sin materia",
      isEvaluated: evaluatedVideogameIds.includes(videogame.id), // Indicar si el videojuego ha sido evaluado
    }));
  }
}