import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VideogameResponseDto } from './dto/videogame-response.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';


@Injectable()
export class VideogamesService {
  constructor(private readonly prisma: PrismaService) { }
  private async checkEvaluationsOpen() {
    const config = await this.prisma.eventConfiguration.findFirst();
    if (!config?.evaluationsOpen) {
      throw new ForbiddenException('Las evaluaciones no están habilitadas en este momento.');
    }
  }

  async searchPendingGames(jurorId: string, search: string) {
    await this.checkEvaluationsOpen();
    // Normalizar el término de búsqueda
    const normalizedSearch = search.trim();
    const isNumeric = /^\d+$/.test(normalizedSearch);
    const numericSearch = isNumeric ? parseInt(normalizedSearch, 10) : null;

    // Construir filtros de búsqueda de manera más eficiente
    const searchConditions: Prisma.VideogameWhereInput['OR'] = [
      { name: { contains: normalizedSearch, mode: 'insensitive' } },
      { team: { teamName: { contains: normalizedSearch, mode: 'insensitive' } } },
      {
        team: {
          members: {
            some: {
              OR: [
                { firstName: { contains: normalizedSearch, mode: 'insensitive' } },
                { lastName: { contains: normalizedSearch, mode: 'insensitive' } }
              ]
            }
          }
        }
      },
    ];

    // Solo agregar búsqueda numérica si el término es un número
    if (numericSearch !== null) {
      searchConditions.push(
        { team: { members: { some: { nrcs: { some: { code: numericSearch } } } } } },
        { team: { members: { some: { nrcs: { some: { subject: { code: { contains: normalizedSearch, mode: 'insensitive' } } } } } } } }
      );
    }

    // Agregar búsqueda por materia siempre
    searchConditions.push(
      { team: { members: { some: { nrcs: { some: { subject: { name: { contains: normalizedSearch, mode: 'insensitive' } } } } } } } }
    );

    // Consulta única optimizada con todas las condiciones
    const videogames = await this.prisma.videogame.findMany({
      where: {
        AND: [
          // Excluir juegos ya evaluados por el jurado
          {
            NOT: {
              evaluations: {
                some: { jurorId }
              }
            }
          },
          // Solo juegos de equipos asignados al jurado
          {
            team: {
              assignedJurors: {
                some: { id: jurorId }
              }
            }
          },
          // Aplicar filtros de búsqueda
          normalizedSearch ? { OR: searchConditions } : {}
        ]
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        description: true,
        team: {
          select: {
            id: true, // teamId: lo necesita el front para /team-verification (HU-19)
            teamName: true,
            teamCode: true, // [MODIFICACIÓN]: Agregado teamCode para enviar al frontend
            members: {
              select: {
                firstName: true,
                lastName: true,
                nrcs: {
                  select: {
                    code: true,
                    subject: {
                      select: {
                        name: true
                      }
                    },
                  },
                  take: 1, // Optimización: solo tomar el primer NRC para subject/materia
                },
              },
            },
          },
        },
      },
      // Agregar límite para evitar resultados excesivos
      take: 100,
    });

    // Procesamiento optimizado de datos
    const data = videogames.map((videogame) => {
      // Usar Set para NRCs únicos de manera más eficiente
      const nrcCodes = new Set<number>();
      let firstSubject = 'Sin materia';

      videogame.team?.members?.forEach(member => {
        member.nrcs?.forEach(nrc => {
          nrcCodes.add(nrc.code);
          if (firstSubject === 'Sin materia' && nrc.subject?.name) {
            firstSubject = nrc.subject.name;
          }
        });
      });

      return {
        id: videogame.id,
        nombre: videogame.name,
        equipo: videogame.team?.teamName || 'Sin equipo',
        teamId: videogame.team?.id,
        teamCode: videogame.team?.teamCode, // [MODIFICACIÓN]: Mapeo de teamCode
        materia: firstSubject,
        nrc: Array.from(nrcCodes).join(', ') || 'Sin NRC',
        participantes: videogame.team?.members?.map(member =>
          `${member.firstName} ${member.lastName}`
        ) || [],
        imagen: videogame.logoUrl ?? undefined,
        descripcion: videogame.description || 'Sin descripción',
        isEvaluated: false,
      };
    });

    return { data };
  }

  async getPendingVideogames(

    jurorId: string,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<VideogameResponseDto>> {
    await this.checkEvaluationsOpen();
    const offset = (page - 1) * limit;

    // Condición base optimizada usando relaciones directas
    const baseWhere: Prisma.VideogameWhereInput = {
      AND: [
        // Excluir juegos ya evaluados
        {
          NOT: {
            evaluations: {
              some: { jurorId }
            }
          }
        },
        // Solo juegos de equipos asignados
        {
          team: {
            assignedJurors: {
              some: { id: jurorId }
            }
          }
        }
      ]
    };

    // Ejecutar consultas en paralelo para mejor rendimiento
    const [videogames, totalItems] = await Promise.all([
      this.prisma.videogame.findMany({
        where: baseWhere,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          logoUrl: true,
          description: true,
          team: {
            select: {
              id: true, // teamId: lo necesita el front para /team-verification (HU-19)
              teamName: true,
              teamCode: true, // [MODIFICACIÓN]: Agregado teamCode para enviar al frontend
              members: {
                select: {
                  firstName: true,
                  lastName: true,
                  nrcs: {
                    select: {
                      code: true,
                      subject: {
                        select: {
                          name: true
                        }
                      },
                    },
                    take: 1, // Optimización: solo el primer NRC para subject
                  },
                },
              },
            },
          },
        },
        // Agregar ordenamiento para resultados consistentes
        orderBy: {
          registrationDate: 'desc'
        }
      }),
      this.prisma.videogame.count({ where: baseWhere }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    // Procesamiento optimizado de datos
    const data: VideogameResponseDto[] = videogames.map((videogame) => {
      // Optimización: usar Set para NRCs únicos
      const nrcCodes = new Set<number>();
      let firstSubject = 'Sin materia';

      videogame.team?.members?.forEach(member => {
        member.nrcs?.forEach(nrc => {
          nrcCodes.add(nrc.code);
          if (firstSubject === 'Sin materia' && nrc.subject?.name) {
            firstSubject = nrc.subject.name;
          }
        });
      });

      return {
        videogameId: videogame.id,
        videogameName: videogame.name,
        logoUrl: videogame.logoUrl ?? undefined,
        description: videogame.description || 'Sin descripción',
        teamName: videogame.team?.teamName || 'Sin equipo',
        teamId: videogame.team?.id,
        teamCode: videogame.team?.teamCode, // [MODIFICACIÓN]: Mapeo de teamCode
        members: videogame.team?.members?.map(member => ({
          fullName: `${member.firstName} ${member.lastName}`,
        })) || [],
        nrc: Array.from(nrcCodes).join(', ') || 'Sin NRC',
        subject: firstSubject,
      };
    });

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

  // Método adicional optimizado para obtener el conteo
  async getPendingVideogamesCount(jurorId: string): Promise<number> {
    await this.checkEvaluationsOpen();
    return this.prisma.videogame.count({
      where: {
        AND: [
          {
            NOT: {
              evaluations: {
                some: { jurorId }
              }
            }
          },
          {
            team: {
              assignedJurors: {
                some: { id: jurorId }
              }
            }
          }
        ]
      }
    });
  }

  // Método adicional para búsqueda rápida (menos datos)
  async quickSearchPendingGames(jurorId: string, search: string) {
    await this.checkEvaluationsOpen();
    const normalizedSearch = search.trim();

    if (!normalizedSearch) {
      return { data: [] };
    }

    const isNumeric = /^\d+$/.test(normalizedSearch);
    const numericSearch = isNumeric ? parseInt(normalizedSearch, 10) : null;

    const searchConditions: Prisma.VideogameWhereInput['OR'] = [
      { name: { contains: normalizedSearch, mode: 'insensitive' } },
      { team: { teamName: { contains: normalizedSearch, mode: 'insensitive' } } },
    ];

    if (numericSearch !== null) {
      searchConditions.push(
        { team: { members: { some: { nrcs: { some: { code: numericSearch } } } } } }
      );
    }

    const videogames = await this.prisma.videogame.findMany({
      where: {
        AND: [
          {
            NOT: {
              evaluations: {
                some: { jurorId }
              }
            }
          },
          {
            team: {
              assignedJurors: {
                some: { id: jurorId }
              }
            }
          },
          { OR: searchConditions }
        ]
      },
      select: {
        id: true,
        name: true,
        team: {
          select: {
            teamName: true,
          },
        },
      },
      take: 10, // Límite más bajo para búsqueda rápida
    });

    const data = videogames.map(videogame => ({
      id: videogame.id,
      name: videogame.name,
      teamName: videogame.team?.teamName || 'Sin equipo',
    }));

    return { data };
  }
}