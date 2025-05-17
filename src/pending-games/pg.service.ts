import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Injectable()
export class VideogamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPendingVideogames(
    jurorId: string,
  ): Promise<{ data: VideogameResponseDto[] }> {
    // Obtener los IDs de videojuegos ya evaluados por el jurado
    const evaluatedIds = await this.prisma.evaluation.findMany({
      where: { jurorId },
      select: { videogameId: true },
    }).then((evaluations) => evaluations.map((e) => e.videogameId));

    // Obtener los IDs de equipos asignados al jurado desde la tabla JurorTeamAssignment
    const assignedTeamIds = await this.prisma.team.findMany({
      where: {
        assignedJurors: {
          some: { id: jurorId }, // Relación con el jurado actual
        },
      },
      select: { id: true },
    }).then((teams) => teams.map((team) => team.id));

    // Filtrar videojuegos que no han sido evaluados y pertenecen a equipos asignados al jurado
    const whereClause = {
      id: { notIn: evaluatedIds },
      teamId: { in: assignedTeamIds }, // Verificar que el equipo esté asignado al jurado
    };

    // Obtener datos de videojuegos pendientes
    const videogames = await this.prisma.videogame.findMany({
      where: whereClause,
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

    // Mapear los datos para la respuesta
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
        isEvaluated: false,
      };
    });

    return { data };
  }
}