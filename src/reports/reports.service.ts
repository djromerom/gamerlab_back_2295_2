import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) { }

  async getVideogamesData(): Promise<
    {
      id: number | string;
      nombre: string;
      logoUrl?: string | null;
      materia?: string | null;
      nrc?: number | string | null;
      promedio: number;
      criterios: { [nombreCriterio: string]: number };
      evaluacionesCompletadas?: number;
      totalJuradosAsignados?: number;
    }[]
  > {
    const videojuegos = await this.prisma.videogame.findMany({
      where: { isActive: true },
      include: {
        team: {
          include: {
            members: {
              include: {
                nrcs: {
                  where: { isActive: true },
                  include: {
                    subject: true,
                  },
                },
              },
            },
            assignedJurors: true,
          },
        },
        evaluations: {
          where: { isActive: true },
          include: {
            details: {
              include: {
                criterion: true,
              },
            },
          },
        },
        videogameStatus: true,
      },
    });

    return videojuegos.map((v) => {
      const firstMember = v.team.members[0];
      const firstNRC = firstMember?.nrcs[0];

      // Calcular promedios y criterios
      const criterios: { [nombreCriterio: string]: number } = {};
      let totalScore = 0;
      let evaluacionesCompletadas = 0;

      // Procesar evaluaciones
      v.evaluations.forEach(evaluation => {
        if (evaluation.totalScore !== null) { // Considero completas las evaluaciones con score
          evaluacionesCompletadas++;
          totalScore += evaluation.totalScore;
          // Procesar detalles de cada evaluación
          evaluation.details.forEach(detail => {
            const criterioNombre = detail.criterion.name;
            const puntajePonderado = detail.score; // * (detail.criterion.weight ?? 1); // "/ 100";

            criterios[criterioNombre] = (criterios[criterioNombre] || 0) + puntajePonderado;
          });
        }
      });

      // Calcular promedios por criterio
      if (evaluacionesCompletadas > 0) {
        for (const [criterio, suma] of Object.entries(criterios)) {
          criterios[criterio] = suma / evaluacionesCompletadas;
        }
      }

      const promedio = evaluacionesCompletadas > 0
        ? totalScore / evaluacionesCompletadas
        : 0;

      return {
        id: v.id,
        nombre: v.name,
        logoUrl: v.logoUrl ?? null,
        materia: firstNRC?.subject.name ?? null,
        nrc: firstNRC?.code ? String(firstNRC.code) : null,
        promedio,
        criterios,
        evaluacionesCompletadas,
        totalJuradosAsignados: v.team.assignedJurors.length,
      };
    });
  }

  async getSubjects(): Promise<{ id: number; name: string }[]> {
    return this.prisma.subject.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getSubjectAverageScores(): Promise<{ name: string; value: number }[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      include: {
        nrcs: {
          where: { isActive: true },
          include: {
            members: {
              include: {
                team: {
                  include: {
                    videogame: {
                      include: {
                        evaluations: {
                          include: {
                            details: true,
                          },
                        },
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

    const results: { name: string; value: number }[] = [];

    for (const subject of subjects) {
      let totalScore = 0;
      let scoreCount = 0;

      for (const nrc of subject.nrcs) {
        for (const member of nrc.members) {
          const team = member.team;
          const videogame = team?.videogame;
          const evaluations = videogame?.evaluations ?? [];

          for (const evaluation of evaluations) {
            for (const detail of evaluation.details) {
              totalScore += detail.score;
              scoreCount++;
            }
          }
        }
      }

      results.push({
        name: subject.name,
        value: scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(2)) : 0,
      });
    }

    return results;
  }

async getNrcWithSubjectNameAndAverage(): Promise<
  { id: number; codigo: number; materiaNombre: string; promedioxNRC?: number }[]
> {
  // 1. Obtener TODOS los NRCs activos con su información básica
  const todosLosNrcsActivos = await this.prisma.nRC.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      subject: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { // Opcional: ordenar
      code: 'asc'
    }
  });

  // Si no hay NRCs activos, retornar un array vacío
  if (!todosLosNrcsActivos.length) {
    return [];
  }

  // 2. Calcular los promedios de videojuegos para los NRCs que SÍ tienen videojuegos evaluados
  //    (Esta parte de la lógica es similar a la anterior, pero la guardaremos en un Map)

  const videojuegosConInfo = await this.prisma.videogame.findMany({
    where: { isActive: true },
    include: {
      team: {
        include: {
          members: {
            where: { isActive: true },
            include: {
              nrcs: {
                where: { isActive: true },
                select: { id: true }, // Solo necesitamos el ID del NRC aquí para agrupar
              },
            },
          },
        },
      },
      evaluations: {
        where: { isActive: true },
        select: { totalScore: true },
      },
    },
  });

  // Mapa para almacenar temporalmente la suma de promedios y el conteo de videojuegos por nrcId
  const promediosAgregadosPorNrc = new Map<number, { sum: number; count: number }>();

  videojuegosConInfo.forEach((vj) => {
    let sumaScoresVideojuego = 0;
    let numEvaluacionesVideojuego = 0;
    vj.evaluations.forEach(ev => {
      if (typeof ev.totalScore === 'number') {
        sumaScoresVideojuego += ev.totalScore;
        numEvaluacionesVideojuego++;
      }
    });
    const promedioEsteVideojuego = numEvaluacionesVideojuego > 0
      ? sumaScoresVideojuego / numEvaluacionesVideojuego
      : null; // Usamos null si no hay promedio, para filtrarlo luego si es necesario

    if (promedioEsteVideojuego === null) {
      return; // No consideramos videojuegos sin promedio para el cálculo del NRC
    }

    const nrcsDelVideojuego = new Set<number>();
    vj.team.members.forEach(member => {
      member.nrcs.forEach(nrc => { // nrc aquí solo tiene 'id' por el select
        if (!nrcsDelVideojuego.has(nrc.id)) {
          if (!promediosAgregadosPorNrc.has(nrc.id)) {
            promediosAgregadosPorNrc.set(nrc.id, { sum: 0, count: 0 });
          }
          const nrcData = promediosAgregadosPorNrc.get(nrc.id)!;
          nrcData.sum += promedioEsteVideojuego;
          nrcData.count += 1;
          nrcsDelVideojuego.add(nrc.id);
        }
      });
    });
  });

  // 3. Combinar la lista completa de NRCs con los promedios calculados
  const resultado = todosLosNrcsActivos.map(nrcBase => {
    const datosPromedio = promediosAgregadosPorNrc.get(nrcBase.id);
    let promedioxNRC: number | undefined = undefined;

    if (datosPromedio && datosPromedio.count > 0) {
      promedioxNRC = datosPromedio.sum / datosPromedio.count;
    }

    return {
      id: nrcBase.id,
      codigo: nrcBase.code,
      materiaNombre: nrcBase.subject.name,
      promedioxNRC: promedioxNRC !== undefined ? parseFloat(promedioxNRC.toFixed(2)) : undefined,
    };
  });

  return resultado; // Ya está ordenado si se añadió orderBy en la primera query
}

async getJuradosData(): Promise<
  {
    id: string; // El ID del User es string (UUID)
    nombre: string;
    correo?: string;
    videojuegosAsignados: string[];
    videojuegosCompletos: string[];
  }[]
> {
  // 1. Obtener todos los usuarios que tienen el rol de "Jurado"
  //    Asumimos que tienes un ID o nombre específico para el rol de jurado.
  //    Por ejemplo, si el rol "Jurado" tiene id_rol = 3
  const ROL_JURADO_ID = 4; // ¡AJUSTA ESTE ID SEGÚN TU CONFIGURACIÓN DE ROLES!

  const juradosUsuarios = await this.prisma.user.findMany({
    where: {
      roleId: ROL_JURADO_ID,
      isActive: true, // Solo jurados activos
    },
    select: {
      id: true,
      firstName: true, // Usamos 'firstName' como el nombre principal del jurado
      lastName: true, // Usamos 'lastName' como el apellido del jurado
      email: true,
      // Para videojuegosAsignados: User -> teamsToEvaluate (Team[]) -> videogame (Videogame)
      teamsToEvaluate: {
        where: {
          isActive: true, // Solo equipos activos
          videogame: { // Asegurarse que el equipo tenga un videojuego asociado y activo
            isActive: true,
          }
        },
        select: {
          videogame: {
            select: {
              name: true,
            },
          },
        },
      },
      // Para videojuegosCompletos: User -> evaluationsSubmitted (Evaluation[]) -> videogame (Videogame)
      evaluationsSubmitted: {
        where: {
          isActive: true, // Solo evaluaciones activas
          // Opcional: podrías filtrar por edición activa aquí si es relevante
          // editionId: EDICION_ACTIVA_ID,
        },
        select: {
          videogame: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  // 2. Mapear los datos al formato deseado
  const resultado = juradosUsuarios.map(user => {
    // Videojuegos Asignados
    const videojuegosAsignadosNombres = user.teamsToEvaluate
      .map(team => team.videogame?.name) // Obtiene el nombre del videojuego del equipo
      .filter((name): name is string => !!name); // Filtra null/undefined y asegura que es string

    // Videojuegos Completados (Evaluados)
    const videojuegosCompletosNombres = user.evaluationsSubmitted
      .map(evaluation => evaluation.videogame.name) // Obtiene el nombre del videojuego de la evaluación
      .filter((name): name is string => !!name); // Filtra null/undefined

    // Para eliminar duplicados si un jurado evaluó el mismo juego múltiples veces (no debería por la constraint unique)
    // o si fue asignado al mismo juego a través de múltiples equipos (improbable pero posible)
    const uniqueAsignados = [...new Set(videojuegosAsignadosNombres)];
    const uniqueCompletos = [...new Set(videojuegosCompletosNombres)];

    const partesNombre = [user.firstName, user.lastName].filter(Boolean); // Filtrar valores falsy
    const nombreCompleto = partesNombre.join(" ").trim(); // Unir con espacio

    return {
      id: user.id,
      nombre: nombreCompleto || "Nombre no disponible", // Fallback si 'firstName' es null
      correo: user.email, // 'email' es requerido en tu modelo User, así que debería estar
      videojuegosAsignados: uniqueAsignados,
      videojuegosCompletos: uniqueCompletos,
    };
  });

  return resultado;
}

async getVideogamesDataFilter(
    materia?: string,
    nrc?: number
  ): Promise<{
    id: number | string;
    nombre: string;
    logoUrl?: string | null;
    materia?: string | null;
    nrc?: number | string | null;
    promedio: number;
    criterios: { [nombreCriterio: string]: number };
    evaluacionesCompletadas?: number;
    totalJuradosAsignados?: number;
  }[]> {
    const videojuegos = await this.prisma.videogame.findMany({
      where: { 
        isActive: true,
        team: {
          members: {
            some: {
              nrcs: {
                some: {
                  ...(nrc ? { code: nrc } : {}),
                  ...(materia ? { 
                    subject: { 
                      name: { contains: materia, mode: 'insensitive' } 
                    } 
                  } : {})
                }
              }
            }
          }
        }
      },
      include: {
        team: {
          include: {
            members: {
              include: {
                nrcs: {
                  where: { isActive: true },
                  include: {
                    subject: true,
                  },
                },
              },
            },
            assignedJurors: true,
          },
        },
        evaluations: {
          where: { isActive: true },
          include: {
            details: {
              include: {
                criterion: true,
              },
            },
          },
        },
        videogameStatus: true,
      },
    });
  
    return videojuegos.map((v) => {
      const firstMember = v.team.members[0];
      const firstNRC = firstMember?.nrcs[0];
      
      // Calcular promedios y criterios
      const criterios: { [nombreCriterio: string]: number } = {};
      let totalScore = 0;
      let evaluacionesCompletadas = 0;
      
      // Procesar evaluaciones
      v.evaluations.forEach(evaluation => {
        if (evaluation.totalScore !== null) { // Considero completas las evaluaciones con score
          evaluacionesCompletadas++;
          totalScore += evaluation.totalScore;
          // Procesar detalles de cada evaluación
          evaluation.details.forEach(detail => {
            const criterioNombre = detail.criterion.name;
            const puntajePonderado = detail.score; //* (detail.criterion.weight ?? 1); // "/ 100";
            
            criterios[criterioNombre] = (criterios[criterioNombre] || 0) + puntajePonderado;
          });
        }
      });
  
      // Calcular promedios por criterio
      if (evaluacionesCompletadas > 0) {
        for (const [criterio, suma] of Object.entries(criterios)) {
          criterios[criterio] = suma / evaluacionesCompletadas;
        }
      }
  
      const promedio = evaluacionesCompletadas > 0 
        ? totalScore / evaluacionesCompletadas 
        : 0;
  
      return {
        id: v.id,
        nombre: v.name,
        logoUrl: v.logoUrl ?? null,
        materia: firstNRC?.subject.name ?? null,
        nrc: firstNRC?.code ? String(firstNRC.code) : null,
        promedio,
        criterios,
        evaluacionesCompletadas,
        totalJuradosAsignados: v.team.assignedJurors.length,
      };
    });
  }
  
}
