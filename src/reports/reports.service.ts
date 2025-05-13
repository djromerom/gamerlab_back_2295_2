import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvaluationsByVideogame(videogameId: number) {
    // Verificar que el videojuego exista
    const videojuego = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
      select: { id: true, name: true },
    });

    if (!videojuego) {
      throw new NotFoundException('Videojuego no encontrado');
    }

    // Obtener evaluaciones activas con detalles y criterios
    const evaluaciones = await this.prisma.evaluation.findMany({
      where: {
        videogameId,
        isActive: true,
      },
      include: {
        juror: {
          select: { name: true }, // Ajusta al modelo User si es necesario
        },
        details: {
          where: { isActive: true },
          include: {
            criterion: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Si no hay evaluaciones
    if (evaluaciones.length === 0) {
      return {
        videojuegoId: videojuego.id,
        nombre: videojuego.name,
        evaluaciones: [],
        promedioPorCriterio: [],
        promedioTotal: 0,
      };
    }

    // Calcular evaluaciones individuales con promedio
    const evaluacionesFormateadas = evaluaciones.map((ev) => {
      const detalles = ev.details.map((d) => ({
        criterio: d.criterion.name,
        puntaje: d.score,
      }));

      const promedio =
        detalles.reduce((sum, d) => sum + d.puntaje, 0) / detalles.length;

      return {
        jurado: ev.juror.name,
        fecha: ev.date,
        detalles,
        promedio: Number(promedio.toFixed(2)),
      };
    });

    // Calcular promedio por criterio global
    const criterioMap = new Map<string, number[]>();

    evaluaciones.forEach((ev) => {
      ev.details.forEach((d) => {
        const nombre = d.criterion.name;
        if (!criterioMap.has(nombre)) {
          criterioMap.set(nombre, []);
        }
        criterioMap.get(nombre)!.push(d.score);
      });
    });

    const promedioPorCriterio = Array.from(criterioMap.entries()).map(
      ([criterio, scores]) => ({
        criterio,
        promedio: Number(
          (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
        ),
      }),
    );

    // Calcular promedio total (promedio de los promedios)
    const promedioTotal =
      evaluacionesFormateadas.reduce((acc, ev) => acc + ev.promedio, 0) /
      evaluacionesFormateadas.length;

    return {
      videojuegoId: videojuego.id,
      nombre: videojuego.name,
      evaluaciones: evaluacionesFormateadas,
      promedioPorCriterio,
      promedioTotal: Number(promedioTotal.toFixed(2)),
    };
  }
  
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
    totalJuradosAsignados?: number;}[]
  > {
    const videojuegos = await this.prisma.videogame.findMany({
      where: { isActive: true },
      include: {
        team: {
          include: {
            members: {
              include: {
                nrcs: {
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
            const puntajePonderado = detail.score * (detail.criterion.weight ?? 1) / 100;
            
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
      select: {
        id: true,
        name: true,
      },
    });
  }

  async getNrcWithSubjectName(): Promise<
  { id: number; codigo: number; materiaNombre: string }[]
> {
  const nrcs = await this.prisma.nRC.findMany({
    select: {
      id: true,
      code: true,
      subject: {
        select: {
          name: true,
        },
      },
    },
  });

  return nrcs.map(nrc => ({
    id: nrc.id,
    codigo: nrc.code,
    materiaNombre: nrc.subject.name,
  }));
}

async getSubjectAverageScores(): Promise<{ name: string; value: number }[]> {
  const subjects = await this.prisma.subject.findMany({
    include: {
      nrcs: {
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

}
