import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CONFIRMED_VIDEOGAME, GRADABLE_TEAM } from 'src/teams/team-status';

type EvaluationClient = Pick<PrismaService, 'evaluation'>;

/**
 * BG-72 (ARK-283): equipos que cuentan como «por calificar» para un jurado. Son los mismos que
 * sigue el panel (HU-21, BG-35, HU-39): de la edición, activos, con el juego activo y confirmado,
 * y calificables.
 */
export function pendingTeamsWhere(editionId: number) {
  return {
    editionId,
    isActive: true,
    videogame: { is: { isActive: true, ...CONFIRMED_VIDEOGAME } },
    ...GRADABLE_TEAM,
  } satisfies Prisma.TeamWhereInput;
}

export type AssignedTeam = { videogame: { id: number } | null };

/** Claves `jurado:videojuego` de las evaluaciones activas de estos jurados en la edición. */
export async function evaluatedKeys(
  prisma: EvaluationClient,
  editionId: number,
  jurorIds: string[],
): Promise<Set<string>> {
  if (jurorIds.length === 0) return new Set();
  const rows = await prisma.evaluation.findMany({
    where: { editionId, isActive: true, jurorId: { in: jurorIds } },
    select: { jurorId: true, videogameId: true },
  });
  return new Set(rows.map((r) => `${r.jurorId}:${r.videogameId}`));
}

/** Cuántos equipos asignados le faltan por calificar (sin una evaluación activa suya). */
export function countPendingTeams(
  jurorId: string,
  teams: AssignedTeam[],
  evaluated: Set<string>,
): number {
  return teams.filter(
    (team) =>
      team.videogame !== null &&
      !evaluated.has(`${jurorId}:${team.videogame.id}`),
  ).length;
}
