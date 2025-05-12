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

  async getVideogamesWithSubjectAndNRC() {
    const videojuegos = await this.prisma.videogame.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        team: {
          select: {
            members: {
              select: {
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
  
    // Estructurar los datos
    return videojuegos.map((v) => {
      const firstNRC = v.team.members[0]?.nrc;
      return {
        id: v.id,
        nombre: v.name,
        logoUrl: v.logoUrl,
        materia: firstNRC?.subject.name ?? null,
        nrc: firstNRC?.code ?? null,
      };
    });
  }

  async getSubjects(): Promise<{ id: number; nombre: string }[]> {
    return this.prisma.subject.findMany({
      select: {
        id: true,
        nombre: true,
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

  async getAverageScorePerSubject(): Promise<{ name: string; value: number }[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        nrcs: {
          select: {
            videogames: {
              select: {
                evaluations: {
                  select: {
                    evaluationDetails: {
                      select: { score: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const result = subjects.map((subject) => {
      const allScores: number[] = [];

      subject.nrcs.forEach((nrc) => {
        nrc.videogames.forEach((vg) => {
          vg.evaluations.forEach((ev) => {
            ev.evaluationDetails.forEach((detail) => {
              allScores.push(detail.score);
            });
          });
        });
      });

      const total = allScores.reduce((acc, curr) => acc + curr, 0);
      const avg = allScores.length > 0 ? total / allScores.length : 0;

      return {
        name: subject.name,
        value: parseFloat(avg.toFixed(2)),
      };
    });

    return result;
  }

}
