import { JurorAssignmentAuditLog } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { warningText } from '../assignment-validation/assignment-warning-texts';

/**
 * ARK-262 (BG-62): lo que devuelve `GET /juror/assignments/audit` por registro. Se conservan los
 * campos guardados y se suman los nombres, para que el front no tenga que adivinar quién es cada
 * id (el administrador que hizo el cambio no suele estar en las listas que ya cargó). Un nombre
 * es `null` cuando el registro no trae ese dato o el usuario o equipo ya no existe.
 */
export interface AuditLogView extends JurorAssignmentAuditLog {
  actorName: string | null;
  jurorName: string | null;
  previousJurorName: string | null;
  newJurorName: string | null;
  teamName: string | null;
  teamCode: string | null;
  gameName: string | null;
  /** `notes` con los códigos de advertencia traducidos. Lo guardado no cambia. */
  notesText: string | null;
}

const ACCEPTED_WARNINGS = /Advertencias aceptadas: ([A-Z_]+(?:, [A-Z_]+)*)\./;

/**
 * «… Advertencias aceptadas: TEAM_UNDER_MIN.» → «… Advertencias aceptadas: El grupo quedaría con
 * menos de 3 jurados.». Varios códigos se separan con «; ». Un código desconocido se deja como está.
 */
export function translateAuditNote(notes: string | null): string | null {
  if (notes === null) return null;
  return notes.replace(ACCEPTED_WARNINGS, (_match, codes: string) => {
    const texts = codes.split(', ').map(warningText);
    return `Advertencias aceptadas: ${texts.join('; ')}.`;
  });
}

const fullName = (user?: { firstName: string; lastName: string }) =>
  user ? `${user.firstName} ${user.lastName}`.trim() || null : null;

/** Agrega los nombres a una página de registros con una consulta de usuarios y una de equipos. */
export async function withAuditNames(
  prisma: Pick<PrismaService, 'user' | 'team'>,
  logs: JurorAssignmentAuditLog[],
): Promise<AuditLogView[]> {
  const userIds = new Set<string>();
  const teamIds = new Set<number>();
  for (const log of logs) {
    for (const id of [
      log.actorUserId,
      log.jurorId,
      log.previousJurorId,
      log.newJurorId,
    ]) {
      if (id) userIds.add(id);
    }
    if (log.teamId !== null) teamIds.add(log.teamId);
  }

  const [users, teams] = await Promise.all([
    userIds.size === 0
      ? []
      : prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, firstName: true, lastName: true },
        }),
    teamIds.size === 0
      ? []
      : prisma.team.findMany({
          where: { id: { in: [...teamIds] } },
          select: {
            id: true,
            teamName: true,
            teamCode: true,
            videogame: { select: { name: true } },
          },
        }),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const nameOf = (id: string | null) =>
    id ? fullName(userById.get(id)) : null;

  return logs.map((log) => {
    const team = log.teamId === null ? undefined : teamById.get(log.teamId);
    return {
      ...log,
      actorName: nameOf(log.actorUserId),
      jurorName: nameOf(log.jurorId),
      previousJurorName: nameOf(log.previousJurorId),
      newJurorName: nameOf(log.newJurorId),
      teamName: team?.teamName ?? null,
      teamCode: team?.teamCode ?? null,
      gameName: team?.videogame?.name ?? null,
      notesText: translateAuditNote(log.notes),
    };
  });
}
