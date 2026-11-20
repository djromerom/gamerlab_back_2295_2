import { Prisma } from '@prisma/client';
import { teamLevelLabel } from 'src/jurors/juror/assignment-validation/team-level';

/** HU-22 (ARK-84): título del aviso, igual en la pantalla y en el asunto del correo. */
export const SUBSTITUTE_NOTICE_MESSAGE = 'Te asignaron grupos';

/** Código del 404 cuando el aviso no existe o no es del usuario. */
export const SUBSTITUTE_NOTICE_NOT_FOUND = 'SUBSTITUTE_NOTICE_NOT_FOUND';

/** BG-74: código del 409 cuando se pide reenviar un correo que no está en FAILED. */
export const SUBSTITUTE_NOTICE_EMAIL_NOT_FAILED = 'SUBSTITUTE_NOTICE_EMAIL_NOT_FAILED';

/** Largo máximo del motivo guardado cuando el correo falla (columna `error_correo`). */
export const EMAIL_ERROR_MAX_LENGTH = 200;

export const noticeTeamSelect = {
  teamId: true,
  teamCode: true,
  teamName: true,
  videogameName: true,
  level: true,
} satisfies Prisma.SubstituteNoticeTeamSelect;

export const noticeSelect = {
  id: true,
  createdAt: true,
  readAt: true,
  teams: { select: noticeTeamSelect },
} satisfies Prisma.SubstituteNoticeSelect;

export type NoticeRow = Prisma.SubstituteNoticeGetPayload<{
  select: typeof noticeSelect;
}>;

type NoticeTeamRow = NoticeRow['teams'][number];

/** Por nivel (sin nivel al final) y luego por código. */
function byLevelThenCode(a: NoticeTeamRow, b: NoticeTeamRow): number {
  const levelA = a.level ?? Number.POSITIVE_INFINITY;
  const levelB = b.level ?? Number.POSITIVE_INFINITY;
  if (levelA !== levelB) return levelA - levelB;
  return a.teamCode.localeCompare(b.teamCode, 'es', { sensitivity: 'base' });
}

export function toNoticeTeams(teams: NoticeTeamRow[]) {
  return [...teams].sort(byLevelThenCode).map((team) => ({
    teamId: team.teamId,
    teamCode: team.teamCode,
    teamName: team.teamName,
    videogameName: team.videogameName,
    level: team.level,
    levelLabel: teamLevelLabel(team.level),
  }));
}

/** Lo que recibe la pantalla del suplente. Sin datos de otras personas. */
export function toNoticeItem(notice: NoticeRow) {
  return {
    id: notice.id,
    createdAt: notice.createdAt,
    readAt: notice.readAt,
    message: SUBSTITUTE_NOTICE_MESSAGE,
    teams: toNoticeTeams(notice.teams),
  };
}

/** Sin leer primero; dentro de cada grupo, el más reciente primero. */
export function byUnreadThenNewest(a: NoticeRow, b: NoticeRow): number {
  const unreadA = a.readAt === null ? 0 : 1;
  const unreadB = b.readAt === null ? 0 : 1;
  if (unreadA !== unreadB) return unreadA - unreadB;
  return b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
}

/** Motivo corto del fallo del correo: solo el nombre y el mensaje del error, recortados. */
export function shortEmailError(error: unknown): string {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'Error desconocido al enviar el correo';
  return text.length > EMAIL_ERROR_MAX_LENGTH
    ? `${text.slice(0, EMAIL_ERROR_MAX_LENGTH - 1)}…`
    : text;
}
