import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EditionStatus, Prisma } from '@prisma/client';

/**
 * ARK-130 (HU-27): fuente única de «la edición de trabajo».
 *
 * - Leer: los listados usan la edición pedida o, por defecto, la ACTIVE (`resolveListEdition`).
 * - Escribir: inscribir, editar, asignar, quitar y calificar solo se permite sobre datos de la
 *   edición ACTIVE, y lo exige el servidor (`assertTeamWritable`, `assertNrcWritable`...).
 * - Nunca «la edición con el id más alto»: una edición nueva se crea INACTIVE y la de trabajo es
 *   la que el administrador activa. Si por error hubiera dos ACTIVE, gana la más reciente (id
 *   mayor), igual que en todas las consultas de antes.
 *
 * Qué es global y qué es por edición: `docs/editions.md`.
 */

/** Filtro Prisma de la edición activa, para usar dentro de otras consultas. */
export const ACTIVE_EDITION_WHERE = {
  status: EditionStatus.ACTIVE,
} satisfies Prisma.EditionWhereInput;

/** Cliente mínimo: sirve el `PrismaService` y el cliente de una transacción. */
type EditionClient = { edition: Pick<Prisma.EditionDelegate, 'findFirst'> };

const activeEditionSelect = {
  id: true,
  title: true,
  status: true,
  year: true,
  semester: true,
  startsAt: true,
  endsAt: true,
} satisfies Prisma.EditionSelect;

export type ActiveEdition = Prisma.EditionGetPayload<{
  select: typeof activeEditionSelect;
}>;

export const NO_ACTIVE_EDITION_MESSAGE =
  'No hay una edición activa. Actívala en Ediciones antes de continuar.';

/** Código del 404 cuando no hay edición activa (el front lo distingue de «no encontrado»). */
export const NO_ACTIVE_EDITION = 'NO_ACTIVE_EDITION';

/** La edición activa o `null` (periodo entre ediciones). */
export async function findActiveEdition(
  prisma: EditionClient,
): Promise<ActiveEdition | null> {
  return prisma.edition.findFirst({
    where: ACTIVE_EDITION_WHERE,
    orderBy: { id: 'desc' },
    select: activeEditionSelect,
  });
}

/** La edición activa; 404 con un mensaje claro si no hay ninguna. */
export async function requireActiveEdition(
  prisma: EditionClient,
  message: string = NO_ACTIVE_EDITION_MESSAGE,
): Promise<ActiveEdition> {
  const edition = await findActiveEdition(prisma);
  if (!edition) {
    throw new NotFoundException({
      statusCode: 404,
      code: NO_ACTIVE_EDITION,
      message,
    });
  }
  return edition;
}

/** Código del 400 cuando se intenta modificar datos de una edición que no es la activa. */
export const EDITION_READ_ONLY = 'EDITION_READ_ONLY';

/** Qué se intenta modificar, para el mensaje: «el equipo», «el NRC», «la asignación»... */
export type EditionScopedEntity =
  | 'el equipo'
  | 'el NRC'
  | 'el integrante'
  | 'el videojuego'
  | 'los jurados del equipo'
  | 'los ponderados';

/**
 * 400 `EDITION_READ_ONLY` si `edition` no es la activa. Las ediciones anteriores son historial:
 * se consultan, pero no se modifican.
 */
export function assertEditionWritable(
  edition: { status: EditionStatus; title?: string | null },
  entity: EditionScopedEntity,
): void {
  if (edition.status === EditionStatus.ACTIVE) return;
  const name = edition.title ? `«${edition.title}»` : 'una edición anterior';
  throw new BadRequestException({
    statusCode: 400,
    code: EDITION_READ_ONLY,
    message:
      `No se ${entity.startsWith('los ') ? 'pueden' : 'puede'} modificar ${entity}: ` +
      `${entity.startsWith('los ') ? 'pertenecen' : 'pertenece'} a ${name}, que no es la edición activa. ` +
      'Las ediciones anteriores son de solo lectura.',
  });
}

type TeamClient = { team: Pick<Prisma.TeamDelegate, 'findUnique'> };
type NrcClient = { nRC: Pick<Prisma.NRCDelegate, 'findUnique'> };
type MemberClient = { member: Pick<Prisma.MemberDelegate, 'findUnique'> };
type VideogameClient = {
  videogame: Pick<Prisma.VideogameDelegate, 'findUnique'>;
};

const editionOf = { select: { status: true, title: true } } as const;

/**
 * 404 si el equipo no existe; 400 `EDITION_READ_ONLY` si no es de la edición activa.
 * Se usa en toda operación que cambie un equipo, sus integrantes, su videojuego o sus jurados.
 */
export async function assertTeamWritable(
  prisma: TeamClient,
  teamId: number,
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { edition: editionOf },
  });
  if (!team)
    throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
  assertEditionWritable(team.edition, 'el equipo');
}

/** Igual que `assertTeamWritable`, para varios equipos (asignaciones en bloque). */
export async function assertTeamsWritable(
  prisma: TeamClient,
  teamIds: number[],
): Promise<void> {
  for (const teamId of [...new Set(teamIds)]) {
    await assertTeamWritable(prisma, teamId);
  }
}

/** 404 si el NRC no existe; 400 `EDITION_READ_ONLY` si es de otra edición. */
export async function assertNrcWritable(
  prisma: NrcClient,
  nrcId: number,
): Promise<void> {
  const nrc = await prisma.nRC.findUnique({
    where: { id: nrcId },
    select: { edition: editionOf },
  });
  if (!nrc) throw new NotFoundException(`NRC con ID ${nrcId} no encontrado`);
  assertEditionWritable(nrc.edition, 'el NRC');
}

/** 404 si el integrante no existe; 400 `EDITION_READ_ONLY` si es de otra edición. */
export async function assertMemberWritable(
  prisma: MemberClient,
  memberId: number,
): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { edition: editionOf },
  });
  if (!member)
    throw new NotFoundException(`Integrante con ID ${memberId} no encontrado`);
  assertEditionWritable(member.edition, 'el integrante');
}

/** 404 si el videojuego no existe; 400 `EDITION_READ_ONLY` si su equipo es de otra edición. */
export async function assertVideogameWritable(
  prisma: VideogameClient,
  videogameId: number,
): Promise<void> {
  const videogame = await prisma.videogame.findUnique({
    where: { id: videogameId },
    select: { team: { select: { edition: editionOf } } },
  });
  if (!videogame)
    throw new NotFoundException(
      `Videojuego con ID ${videogameId} no encontrado`,
    );
  assertEditionWritable(videogame.team.edition, 'el videojuego');
}
