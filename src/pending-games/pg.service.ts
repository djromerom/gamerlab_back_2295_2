import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Injectable()
export class VideogamesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllVideogamesWithDetails(): Promise<VideogameResponseDto[]> {
    const videogames = await this.prisma.videogame.findMany({
      select: {
        id: true,
        name: true,
        logoUrl: true,
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
  
    return videogames.map((videogame) => ({
      videogameId: videogame.id,
      videogameName: videogame.name,
      logoUrl: videogame.logoUrl,
      teamName: videogame.team?.teamName || "Sin equipo",
      members: videogame.team?.members?.map((member) => ({
        fullName: `${member.firstName} ${member.lastName}`,
      })) || [],
      nrc: videogame.team?.members?.[0]?.nrcs?.[0]?.code || "Sin NRC",
      subject: videogame.team?.members?.[0]?.nrcs?.[0]?.subject?.name || "Sin materia",
    }));
  }
}