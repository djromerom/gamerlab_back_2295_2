import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { SettingsService } from '../settings/settings.service';
import { AppUser } from '../auth/jwt.strategy';
import { ROLE_IDS } from '../auth/constants/roles';
import { countProgress } from '../evaluation/evaluation-progress';
import { EditionStatus } from '@prisma/client';
import { activeEditionTeamOf } from '../teams/active-edition-team';
import {
  JUROR_EDITION_STATUS_LABEL,
  JurorAssignmentRow,
  PROFESSOR_WITH_NRC_STATUS_LABEL,
  sortJurorAssignmentRows,
  toJurorAssignmentRow,
} from './juror-assignment-export';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';
import { resolveListEdition } from '../editions/list-edition';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';

/**
 * ARK-135 (BG-22): id de edición que nunca existe. Sin edición activa los reportes salen
 * vacíos (o en cero) en lugar de mezclar las evaluaciones de ediciones anteriores.
 */
const NO_EDITION_ID = -1;

// ¡AJUSTA ESTE ID SEGÚN TU CONFIGURACIÓN DE ROLES!
const ROL_JURADO_ID = 4;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly blobRefs: BlobReferenceService,
  ) {}

  /**
   * ARK-135 (BG-22): la edición de un reporte. La pedida (404 si no existe) o, por defecto, la
   * activa; sin edición activa, un id que no coincide con nada (el reporte sale vacío).
   */
  private async reportEditionId(editionId?: number): Promise<number> {
    const edition = await resolveListEdition(this.prisma, editionId);
    return edition?.id ?? NO_EDITION_ID;
  }

  private async signLogo(value?: string | null): Promise<string | null> {
    return (await this.blobRefs.resolve(value)) ?? null;
  }

  /**
   * Lista pública de juegos (home). Con `showRanking=false` y un usuario que no es
   * Administrador se omiten las notas: promedio, criterios, finalScore, avgJunior, avgSenior.
   */
  async getVideogamesData(user?: AppUser, editionId?: number): Promise<
    {
      id: number | string;
      nombre: string;
      logoUrl?: string | null;
      materia?: string | null;
      nrc?: number | string | null;
      promedio?: number;
      criterios?: { [nombreCriterio: string]: number };
      evaluacionesCompletadas?: number;
      totalJuradosAsignados?: number;
      codigoEquipo?: string | null;
    }[]
  > {
    const reportEditionId = await this.reportEditionId(editionId);
    const hideRanking =
      user?.roleId !== ROLE_IDS.ADMIN &&
      !(await this.settingsService.isRankingVisible());
    const videojuegos = await this.prisma.videogame.findMany({
      // ARK-135: solo los juegos de la edición del reporte
      where: { isActive: true, team: { editionId: reportEditionId } },
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
            assignedJurors: { where: { isActive: true }, select: { id: true } },
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

    // Batch fetch final-score rows and evaluation counts to avoid N+1 queries
    const vgIds = videojuegos.map((v) => v.id);
    const finalRows = hideRanking
      ? []
      : await this.prisma.teamFinalScore.findMany({ where: { videogameId: { in: vgIds } as any } });
    const finalMap = new Map<number, any>();
    finalRows.forEach((r: any) => finalMap.set(Number(r.videogameId), r));

    const evals = await this.prisma.evaluation.findMany({ where: { videogameId: { in: vgIds } as any, isActive: true }, select: { videogameId: true, jurorId: true, isSenior: true, totalScore: true } });
    // Progreso: solo cuentan las evaluaciones de jurados actualmente asignados (ver evaluation-progress.ts)
    const scoredJurorsByVg = new Map<number, string[]>();
    const countsMap = new Map<number, { juniorCount: number; seniorCount: number; completedCount: number }>();
    vgIds.forEach((id) => countsMap.set(Number(id), { juniorCount: 0, seniorCount: 0, completedCount: 0 }));
    for (const e of evals) {
      const id = Number((e as any).videogameId);
      const entry = countsMap.get(id)!;
      if ((e as any).totalScore !== null && (e as any).totalScore !== undefined) {
        const list = scoredJurorsByVg.get(id) ?? [];
        list.push((e as any).jurorId);
        scoredJurorsByVg.set(id, list);
      }
      if ((e as any).isSenior) entry.seniorCount++; else entry.juniorCount++;
    }

    return await Promise.all(videojuegos.map(async (v) => {
      // Collect all NRC codes and subject names from all team members (some members can belong to multiple NRCs)
      const memberNrcCodes = new Set<string>();
      const memberSubjectNames = new Set<string>();
      v.team.members.forEach((m: any) => {
        (m.nrcs || []).forEach((n: any) => {
          if (n && n.code !== undefined && n.code !== null) memberNrcCodes.add(String(n.code));
          if (n && n.subject && n.subject.name) memberSubjectNames.add(n.subject.name);
        });
      });
      const nrcList = Array.from(memberNrcCodes).sort().join(', ');
      const materiaList = Array.from(memberSubjectNames).filter(Boolean).join(', ');

      // Calcular promedios y criterios
      const criterios: { [nombreCriterio: string]: number } = {};
      let totalScore = 0;
      let evaluacionesCompletadas = 0;

      // Procesar evaluaciones
      v.evaluations.forEach((evaluation) => {
        if (evaluation.totalScore !== null) {
          // Considero completas las evaluaciones con score
          evaluacionesCompletadas++;
          totalScore += evaluation.totalScore;
          // Procesar detalles de cada evaluación
          evaluation.details.forEach((detail) => {
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

      const promedioCalc = evaluacionesCompletadas > 0
        ? totalScore / evaluacionesCompletadas
        : 0;

      const finalRow = finalMap.get(Number(v.id));
      const fsVal = finalRow ? (finalRow.finalScore ?? finalRow.final_score ?? null) : null;
      const avgJuniorVal = finalRow ? (finalRow.avgJunior ?? finalRow.avg_junior ?? finalRow.avgjunior ?? null) : null;
      const avgSeniorVal = finalRow ? (finalRow.avgSenior ?? finalRow.avg_senior ?? finalRow.avgsenior ?? null) : null;
      const finalPromedio: number = fsVal !== null && fsVal !== undefined ? (typeof fsVal === 'number' ? fsVal : parseFloat(String(fsVal))) : promedioCalc;

      const progress = countProgress(
        (v.team?.assignedJurors ?? []).map((j: { id: string }) => j.id),
        scoredJurorsByVg.get(Number(v.id)) ?? [],
      );
      const counts = countsMap.get(Number(v.id)) ?? { juniorCount: 0, seniorCount: 0, completedCount: evaluacionesCompletadas };

      // build integrantes (members list)
      const integrantes = v.team.members.map(m => `${m.firstName} ${m.lastName}`).join(', ');

      // compute semestre from teamCode
      const computeSemestre = (team: any): string => {
        if (!team) return '';
        if ((team as any)?.isExternal) return 'Externos';
        const rawCode: string = (team as any)?.teamCode ?? '';
        const prefix = rawCode.slice(0, 2).toUpperCase(); // N1, N2, N3, N4
        switch (prefix) {
          case 'N1': return '1';
          case 'N2': return '2';
          case 'N3': return '3';
          case 'N4': return '4';
          default: return '';
        }
      };

      const base = {
        id: v.id,
        nombre: v.name,
        logoUrl: await this.signLogo(v.logoUrl),
        teamCode: v.team?.teamCode ?? null,
        teamName: v.team?.teamName ?? null,
        integrantes,
        semestre: computeSemestre(v.team),
        materia: materiaList || null,
        nrc: nrcList || null,
        evaluacionesCompletadas: progress.completed,
        totalJuradosAsignados: progress.assigned,
        juniorCount: counts.juniorCount,
        seniorCount: counts.seniorCount,
        codigoEquipo: v.team.teamCode ?? null,
      };
      if (hideRanking) return base;

      return {
        ...base,
        promedio: finalPromedio,
        criterios,
        finalScore: fsVal !== null && fsVal !== undefined ? (typeof fsVal === 'number' ? fsVal : parseFloat(String(fsVal))) : null,
        avgJunior: avgJuniorVal !== null && avgJuniorVal !== undefined ? (typeof avgJuniorVal === 'number' ? avgJuniorVal : parseFloat(String(avgJuniorVal))) : null,
        avgSenior: avgSeniorVal !== null && avgSeniorVal !== undefined ? (typeof avgSeniorVal === 'number' ? avgSeniorVal : parseFloat(String(avgSeniorVal))) : null,
      };
    }));
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

  /**
   * Promedio por materia (gráficas públicas). Con el ranking oculto (o sin edición activa)
   * y un usuario que no es Administrador devuelve las mismas materias con `value: null`.
   */
  async getSubjectAverageScores(
    user?: AppUser,
    editionId?: number,
  ): Promise<{ name: string; value: number | null }[]> {
    const reportEditionId = await this.reportEditionId(editionId);
    const hideRanking =
      user?.roleId !== ROLE_IDS.ADMIN &&
      !(await this.settingsService.isRankingVisible());
    if (hideRanking) {
      const names = await this.prisma.subject.findMany({
        where: { isActive: true },
        select: { name: true },
      });
      return names.map((s) => ({ name: s.name, value: null }));
    }
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      include: {
        nrcs: {
          // ARK-135: las materias son globales; los NRC y sus evaluaciones, de la edición
          where: { isActive: true, editionId: reportEditionId },
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

    const results: { name: string; value: number | null }[] = [];

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
        value:
          scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(2)) : 0,
      });
    }

    return results;
  }

/**
 * Promedio por NRC (gráficas públicas). Con el ranking oculto (o sin edición activa)
 * y un usuario que no es Administrador devuelve los mismos NRC con `promedioxNRC: null`.
 */
async getNrcWithSubjectNameAndAverage(
  user?: AppUser,
  editionId?: number,
): Promise<
  { id: number; codigo: number; materiaNombre: string; promedioxNRC?: number | null }[]
> {
  const reportEditionId = await this.reportEditionId(editionId);
  const hideRanking =
    user?.roleId !== ROLE_IDS.ADMIN &&
    !(await this.settingsService.isRankingVisible());
  // 1. Los NRC activos de la edición del reporte (ARK-135: antes, los de todas las ediciones)
  const todosLosNrcsActivos = await this.prisma.nRC.findMany({
    where: { isActive: true, editionId: reportEditionId },
    select: {
      id: true,
      code: true,
      subject: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      code: 'asc',
    },
  });

  if (!todosLosNrcsActivos.length) return [];

  if (hideRanking) {
    return todosLosNrcsActivos.map((n) => ({
      id: n.id,
      codigo: n.code,
      materiaNombre: n.subject.name,
      promedioxNRC: null,
    }));
  }

  // 2. Obtener videojuegos y sus evaluaciones para calcular promedios por NRC
  const videojuegosConInfo = await this.prisma.videogame.findMany({
    where: { isActive: true, team: { editionId: reportEditionId } },
    include: {
      team: {
        include: {
          members: {
            where: { isActive: true },
            include: {
              nrcs: {
                where: { isActive: true },
                select: { id: true },
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
      : null;

    if (promedioEsteVideojuego === null) return;

    const nrcsDelVideojuego = new Set<number>();
    vj.team.members.forEach(member => {
      member.nrcs.forEach(nrc => {
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

  return resultado;
}

/**
 * HU-16 (ARK-108): asignación de jurados de una edición (por defecto la activa) para el Excel.
 * BG-40 (ARK-163): solo los jurados de esa edición según `jurorsOfEdition` (HU-25): confirmados
 * en «Jurados de la edición» y profesores con NRC activo en ella. Pendientes, declinados y
 * jurados de otras ediciones no salen. Estado y Tipo son los de la edición, no los de la cuenta.
 * Solo cuenta grupos y evaluaciones de esa edición. 404 si no hay edición o no hay asignaciones.
 */
async getJurorAssignmentReport(editionId?: number): Promise<{
  edition: { id: number; year: number; semester: number; title: string };
  rows: JurorAssignmentRow[];
}> {
  const edition = await this.prisma.edition.findFirst({
    where: editionId ? { id: editionId } : ACTIVE_EDITION_WHERE,
    orderBy: { id: 'desc' },
    select: { id: true, year: true, semester: true, title: true },
  });
  if (!edition) {
    throw new NotFoundException(
      editionId ? `No existe la edición ${editionId}.` : 'No hay una edición activa.',
    );
  }

  const users = await this.prisma.user.findMany({
    where: jurorsOfEdition(edition.id),
    select: {
      firstName: true,
      lastName: true,
      email: true,
      jurorCategory: true,
      jurorType: true,
      // Fila de «Jurados de la edición»: solo existe para los inscritos (los profesores con NRC
      // entran sin ella). jurorsOfEdition ya garantiza que, si existe, está Confirmada.
      jurorEditions: {
        where: { editionId: edition.id },
        select: { type: true },
      },
      teamsToEvaluate: {
        where: { editionId: edition.id, isActive: true },
        select: { teamCode: true, videogame: { select: { id: true, name: true } } },
      },
      evaluationsSubmitted: {
        where: { editionId: edition.id, isActive: true },
        select: { videogameId: true },
      },
    },
  });

  const rows = users.map((u) => {
    const enrollment = u.jurorEditions[0];
    return toJurorAssignmentRow({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      status: enrollment
        ? JUROR_EDITION_STATUS_LABEL.CONFIRMED
        : PROFESSOR_WITH_NRC_STATUS_LABEL,
      jurorCategory: u.jurorCategory,
      // En una edición manda jurado_edicion.tipo (PR #218); sin fila, el dato de la cuenta
      jurorType: enrollment?.type ?? u.jurorType,
      assigned: u.teamsToEvaluate.map((t) => ({
        teamCode: t.teamCode,
        videogameId: t.videogame?.id ?? null,
        videogameName: t.videogame?.name ?? null,
      })),
      evaluatedVideogameIds: u.evaluationsSubmitted.map((e) => e.videogameId),
    });
  });

  if (rows.every((r) => r.totalAsignados === 0)) {
    throw new NotFoundException('No hay asignaciones para exportar.');
  }
  return { edition, rows: sortJurorAssignmentRows(rows) };
}

/**
 * Reporte de jurados (Estadísticas → tabla por jurado). ARK-135 (BG-22): los juegos asignados y
 * los evaluados son solo los de la edición del reporte (por defecto la activa). La lista de
 * jurados sigue siendo la de las cuentas de jurado activas (la cuenta es global).
 */
async getJuradosData(editionId?: number): Promise<
  {
    id: string; // El ID del User es string (UUID)
    nombre: string;
    correo?: string;
    videojuegosAsignados: string[];
    videojuegosCompletos: string[];
    estado?: string;
  }[]
> {
  // 1. Obtener todos los usuarios que tienen el rol de "Jurado"
  //    Asumimos que tienes un ID o nombre específico para el rol de jurado.
  //    Por ejemplo, si el rol "Jurado" tiene id_rol = 3

  const reportEditionId = await this.reportEditionId(editionId);

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
      isActive: true,
      confirmationStatus: {
        select: { status: true }
      },
      // Para videojuegosAsignados: User -> teamsToEvaluate (Team[]) -> videogame (Videogame)
      teamsToEvaluate: {
        where: {
          isActive: true, // Solo equipos activos
          editionId: reportEditionId,
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
          editionId: reportEditionId,
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
      estado: user.isActive ? (user.confirmationStatus?.status ?? 'Activo') : 'Inactivo',
      videojuegosAsignados: uniqueAsignados,
      videojuegosCompletos: uniqueCompletos,
    };
  });

  return resultado;
}

  /**
   * Jurados asignados al equipo que lidera el usuario (página "Mis jurados" del estudiante).
   * Mismo formato que getJuradosData, pero sin los jurados de otros equipos (BG-02).
   */
  async getJuradosDataForTeamLeader(userId: string) {
    // ARK-128: el equipo que lidera en la edición activa, no uno de una edición anterior
    const team = await this.prisma.team.findFirst({
      where: { ...activeEditionTeamOf(userId), isActive: true },
      orderBy: { editionId: 'desc' },
      select: { id: true, videogame: { select: { id: true, name: true, isActive: true } } },
    });
    const videogame = team?.videogame;
    if (!team || !videogame?.isActive) return [];

    // Se cruza por ids (equipo y videojuego), no por nombre: dos juegos pueden llamarse igual.
    const jurados = await this.prisma.user.findMany({
      where: {
        roleId: ROL_JURADO_ID,
        isActive: true,
        teamsToEvaluate: { some: { id: team.id } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        confirmationStatus: { select: { status: true } },
        evaluationsSubmitted: {
          where: { isActive: true, videogameId: videogame.id },
          select: { id: true },
        },
      },
    });

    return jurados.map((user) => {
      const nombreCompleto = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      return {
        id: user.id,
        nombre: nombreCompleto || 'Nombre no disponible',
        correo: user.email,
        estado: user.isActive ? (user.confirmationStatus?.status ?? 'Activo') : 'Inactivo',
        videojuegosAsignados: [videogame.name],
        videojuegosCompletos: user.evaluationsSubmitted.length > 0 ? [videogame.name] : [],
      };
    });
  }

  async getVideogamesDataFilter(
    materia?: string,
    nrc?: number,
    editionId?: number,
  ): Promise<{
    id: number | string;
    nombre: string;
    logoUrl?: string | null;
    teamCode?: string | null;
    teamName?: string | null;
    integrantes?: string;
    semestre?: string;
    materia?: string | null;
    nrc?: number | string | null;
    promedio: number;
    criterios: { [nombreCriterio: string]: number };
    evaluacionesCompletadas?: number;
    totalJuradosAsignados?: number;
  }[]> {
    const reportEditionId = await this.reportEditionId(editionId);
    const videojuegos = await this.prisma.videogame.findMany({
      where: { 
        isActive: true,
        team: {
          // ARK-135: el Excel es de una sola edición
          editionId: reportEditionId,
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
            assignedJurors: { where: { isActive: true }, select: { id: true } },
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
  
    // Batch fetch final-score rows and evaluation counts to avoid N+1 queries
    const vgIds = videojuegos.map((v) => v.id);
    const finalRows = await this.prisma.teamFinalScore.findMany({ where: { videogameId: { in: vgIds } as any } });
    const finalMap = new Map<number, any>();
    finalRows.forEach((r: any) => finalMap.set(Number(r.videogameId), r));

    const evals = await this.prisma.evaluation.findMany({ where: { videogameId: { in: vgIds } as any, isActive: true }, select: { videogameId: true, jurorId: true, isSenior: true, totalScore: true } });
    // Progreso: solo cuentan las evaluaciones de jurados actualmente asignados (ver evaluation-progress.ts)
    const scoredJurorsByVg = new Map<number, string[]>();
    const countsMap = new Map<number, { juniorCount: number; seniorCount: number; completedCount: number }>();
    vgIds.forEach((id) => countsMap.set(Number(id), { juniorCount: 0, seniorCount: 0, completedCount: 0 }));
    for (const e of evals) {
      const id = Number((e as any).videogameId);
      const entry = countsMap.get(id)!;
      if ((e as any).totalScore !== null && (e as any).totalScore !== undefined) {
        const list = scoredJurorsByVg.get(id) ?? [];
        list.push((e as any).jurorId);
        scoredJurorsByVg.set(id, list);
      }
      if ((e as any).isSenior) entry.seniorCount++; else entry.juniorCount++;
    }

    return await Promise.all(videojuegos.map(async (v) => {
      // Collect all NRC codes and subject names from all team members
      const memberNrcCodes = new Set<string>();
      const memberSubjectNames = new Set<string>();
      (v.team?.members || []).forEach((m: any) => {
        (m.nrcs || []).forEach((n: any) => {
          if (n && n.code !== undefined && n.code !== null) memberNrcCodes.add(String(n.code));
          if (n && n.subject && n.subject.name) memberSubjectNames.add(n.subject.name);
        });
      });
      const nrcList = Array.from(memberNrcCodes).sort().join(', ');
      const materiaList = Array.from(memberSubjectNames).filter(Boolean).join(', ');

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
  
      const promedioCalc = evaluacionesCompletadas > 0 
        ? totalScore / evaluacionesCompletadas 
        : 0;

      const finalRow = finalMap.get(Number(v.id));
      const fsVal = finalRow ? (finalRow.finalScore ?? finalRow.final_score ?? null) : null;
      const avgJuniorVal = finalRow ? (finalRow.avgJunior ?? finalRow.avg_junior ?? finalRow.avgjunior ?? null) : null;
      const avgSeniorVal = finalRow ? (finalRow.avgSenior ?? finalRow.avg_senior ?? finalRow.avgsenior ?? null) : null;
      const finalPromedio: number = fsVal !== null && fsVal !== undefined ? (typeof fsVal === 'number' ? fsVal : parseFloat(String(fsVal))) : promedioCalc;

      const progress = countProgress(
        (v.team?.assignedJurors ?? []).map((j: { id: string }) => j.id),
        scoredJurorsByVg.get(Number(v.id)) ?? [],
      );
      const counts = countsMap.get(Number(v.id)) ?? { juniorCount: 0, seniorCount: 0, completedCount: evaluacionesCompletadas };
  
      // build integrantes (members list)
      const integrantes = (v.team?.members || []).map(m => `${m.firstName} ${m.lastName}`).join(', ');

      // compute semestre from teamCode
      const computeSemestre = (team: any): string => {
        if (!team) return '';
        if ((team as any)?.isExternal) return 'Externo';
        const rawCode: string = (team as any)?.teamCode ?? '';
        const prefix = rawCode.slice(0, 2).toUpperCase(); // N1, N2, N3, N4
        switch (prefix) {
          case 'N1': return '1';
          case 'N2': return '2';
          case 'N3': return '3';
          case 'N4': return '4';
          default: return '';
        }
      };

      return {
        id: v.id,
        nombre: v.name,
        logoUrl: await this.signLogo(v.logoUrl),
        teamCode: v.team?.teamCode ?? null,
        teamName: v.team?.teamName ?? null,
        integrantes,
        semestre: computeSemestre(v.team),
        materia: materiaList || null,
        nrc: nrcList || null,
        promedio: finalPromedio,
        criterios,
        evaluacionesCompletadas: progress.completed,
        totalJuradosAsignados: progress.assigned,
        finalScore: fsVal !== null && fsVal !== undefined ? (typeof fsVal === 'number' ? fsVal : parseFloat(String(fsVal))) : null,
        avgJunior: avgJuniorVal !== null && avgJuniorVal !== undefined ? (typeof avgJuniorVal === 'number' ? avgJuniorVal : parseFloat(String(avgJuniorVal))) : null,
        avgSenior: avgSeniorVal !== null && avgSeniorVal !== undefined ? (typeof avgSeniorVal === 'number' ? avgSeniorVal : parseFloat(String(avgSeniorVal))) : null,
        juniorCount: counts.juniorCount,
        seniorCount: counts.seniorCount,
      };
    }));
  }
  
}
