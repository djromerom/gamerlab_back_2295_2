import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Injectable()
export class GradedGamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getGradedVideogames(jurorId: string): Promise<{ data: VideogameResponseDto[] }> {
    // Obtener los IDs de videojuegos evaluados por el jurado y su puntaje total
    const evaluations = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: {
        videogameId: true,
        totalScore: true,
      },
    });

    const evaluatedIds = evaluations.map((e) => e.videogameId);
    const scoresMap = new Map(
      evaluations.map((e) => [e.videogameId, e.totalScore]),
    );

    // Obtener todos los videojuegos calificados
    const videogames = await this.prisma.videogame.findMany({
      where: { id: { in: evaluatedIds } },
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
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const data = videogames.map((videogame) => {
      const uniqueNrcs = Array.from(
        new Set(
          videogame.team?.members
            ?.flatMap((member) => member.nrcs?.map((nrc) => nrc.code) || []),
        ),
      );

      return {
        videogameId: videogame.id,
        videogameName: videogame.name,
        logoUrl: videogame.logoUrl,
        description: videogame.description || 'Sin descripción',
        teamName: videogame.team?.teamName || 'Sin equipo',
        members: videogame.team?.members?.map((member) => ({
          fullName: `${member.firstName} ${member.lastName}`,
        })) || [],
        nrc: uniqueNrcs.join(', ') || 'Sin NRC',
        subject: videogame.team?.members?.[0]?.nrcs?.[0]?.subject?.name || 'Sin materia',
        totalScore: scoresMap.get(videogame.id) || 0,
        isEvaluated: true,
      };
    });

    return { data }; // Devolver los datos en una lista llamada "data"
  }
}