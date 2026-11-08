/**
 * ARK-161 (BG-38): qué puede editar un estudiante de su equipo, según la tabla de SP-05
 * (ARK-166) aprobada por Allison el 7 de noviembre.
 *
 * - El líder edita el nombre del equipo y el contenido del juego (descripción, logo, video,
 *   repositorio, fotos, archivo y `entry`) solo mientras las inscripciones estén abiertas.
 * - El nombre del juego, el estado de aprobación, si el equipo es externo, los integrantes,
 *   sus NRC, nombres, códigos y correos los cambia solo el administrador.
 * - Editar el contenido no devuelve el juego a PENDIENTE; cambiar el logo o el nombre del
 *   equipo sí, para que el administrador los revise.
 *
 * El backend responde 403 aunque el cambio llegue directo por la API (no basta con la pantalla).
 */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppUser } from '../auth/jwt.strategy';
import { ROLE_IDS } from '../auth/constants/roles';
import { ACTIVE_EDITION_CONFIG_WHERE } from '../settings/active-edition-config';
import { UpdateTeamDto } from './dto/update-team.dto';

/** Frase que acompaña cada rechazo: el front la muestra tal cual (ARK-187). */
export const ASK_ADMIN = 'Para cambiar este dato, escríbele al administrador.';

export const isAdmin = (user: Pick<AppUser, 'roleId'>): boolean =>
  user.roleId === ROLE_IDS.ADMIN;

/** Datos actuales del equipo que se comparan con lo que envía el estudiante. */
export interface TeamEditSnapshot {
  teamName: string;
  videogameName: string | null;
  logoUrl: string | null;
}

const sameText = (a?: string | null, b?: string | null) =>
  (a ?? '').trim() === (b ?? '').trim();

/** 403 si quien llama no es administrador. `what` dice qué intentó cambiar. */
export function assertAdminOnly(
  user: Pick<AppUser, 'roleId'>,
  what: string,
): void {
  if (isAdmin(user)) return;
  throw new ForbiddenException(
    `Solo el administrador puede cambiar ${what}. ${ASK_ADMIN}`,
  );
}

/**
 * 403 si un estudiante envía en `PATCH /teams/:id` un campo que solo cambia el administrador.
 * Enviar el nombre del juego igual al actual (el front siempre lo manda) no cuenta como cambio.
 */
export function assertStudentTeamPatch(
  dto: UpdateTeamDto,
  current: TeamEditSnapshot,
): void {
  if (dto.members !== undefined)
    throw new ForbiddenException(
      `Solo el administrador puede cambiar los integrantes. ${ASK_ADMIN}`,
    );
  if (dto.isExternal !== undefined)
    throw new ForbiddenException(
      `Solo el administrador puede cambiar si el equipo es externo. ${ASK_ADMIN}`,
    );
  const vg = dto.videogame;
  if (vg?.videogameStatusId !== undefined)
    throw new ForbiddenException(
      `Solo el administrador puede cambiar el estado de aprobación. ${ASK_ADMIN}`,
    );
  if (vg?.vgName !== undefined && !sameText(vg.vgName, current.videogameName))
    throw new ForbiddenException(
      `Solo el administrador puede cambiar el nombre del juego. ${ASK_ADMIN}`,
    );
}

/**
 * ¿La edición del estudiante debe volver a revisión (PENDIENTE)? Solo si cambia el nombre del
 * equipo o el logo. `dto` ya trae el logo como referencia guardada (`withBlobReferences`).
 */
export function studentEditNeedsReview(
  dto: UpdateTeamDto,
  current: TeamEditSnapshot,
): boolean {
  if (dto.teamName !== undefined && !sameText(dto.teamName, current.teamName))
    return true;
  const logo = dto.videogame?.logoUrl;
  if (logo === undefined) return false;
  return (logo || null) !== (current.logoUrl || null);
}

type EventConfigClient = {
  eventConfiguration: Pick<Prisma.EventConfigurationDelegate, 'findFirst'>;
};

/**
 * 403 si las inscripciones de la edición activa están cerradas: desde ahí el estudiante ya no
 * edita su equipo. Sin configuración de la edición activa se considera cerrada, igual que
 * `SettingsService.getRegistrationsOpen`.
 */
export async function assertStudentEditWindowOpen(
  prisma: EventConfigClient,
): Promise<void> {
  const config = await prisma.eventConfiguration.findFirst({
    where: ACTIVE_EDITION_CONFIG_WHERE,
    select: { registrationsOpen: true },
  });
  if (config?.registrationsOpen) return;
  throw new ForbiddenException(
    `Las inscripciones están cerradas: ya no puedes editar tu equipo. ${ASK_ADMIN}`,
  );
}

type TeamSnapshotClient = { team: Pick<Prisma.TeamDelegate, 'findUnique'> };

/** Nombre del equipo, nombre del juego y logo guardados (para comparar con lo enviado). */
export async function loadTeamEditSnapshot(
  prisma: TeamSnapshotClient,
  teamId: number,
): Promise<TeamEditSnapshot> {
  const team = (await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      teamName: true,
      videogame: { select: { name: true, logoUrl: true } },
    },
  })) as {
    teamName: string;
    videogame: { name: string; logoUrl: string | null } | null;
  } | null;
  return {
    teamName: team?.teamName ?? '',
    videogameName: team?.videogame?.name ?? null,
    logoUrl: team?.videogame?.logoUrl ?? null,
  };
}
