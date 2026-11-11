import { ManualJurorAssignmentAction, Prisma } from '@prisma/client';

/**
 * BG-35 (ARK-158): a los jurados solo se les asignan equipos confirmados. El estado de aprobación
 * es el del videojuego (`videogameStatus`: CONFIRMADO, PENDIENTE o RECHAZADO).
 */
export const CONFIRMED_VIDEOGAME_STATUS = 'CONFIRMADO';
export const REJECTED_VIDEOGAME_STATUS = 'RECHAZADO';

/** Filtro sobre `Videogame`: juego aprobado. */
export const CONFIRMED_VIDEOGAME = {
  videogameStatus: { status: CONFIRMED_VIDEOGAME_STATUS },
} satisfies Prisma.VideogameWhereInput;

/** Filtro sobre `Team`: equipo con el juego aprobado. */
export const CONFIRMED_TEAM = {
  videogame: { is: CONFIRMED_VIDEOGAME },
} satisfies Prisma.TeamWhereInput;

export interface ReleasedJuror {
  id: string;
  nombre: string;
}

/**
 * Al pasar a RECHAZADO el equipo pierde sus jurados de verdad, dentro de la transacción del cambio
 * de estado. No se dejan ocultos: volver a confirmar solo cambia el estado y no valida las reglas
 * de HU-08, así que reaparecerían sin revisar la carga ni los niveles de quienes ya tienen otros
 * grupos. Con PENDIENTE no se retiran: un estudiante que cambia el nombre o el logo vuelve a
 * PENDIENTE (ARK-161) y no debe perder sus jurados. Las evaluaciones enviadas no se tocan.
 */
export async function releaseJurorsIfRejected(
  tx: Prisma.TransactionClient,
  teamId: number,
  actorUserId: string,
  requestedStatusId: number | undefined,
): Promise<ReleasedJuror[]> {
  if (requestedStatusId === undefined) return [];
  const status = await tx.videogameStatus.findUnique({
    where: { id: requestedStatusId },
    select: { status: true },
  });
  if (status?.status !== REJECTED_VIDEOGAME_STATUS) return [];

  const team = await tx.team.findUnique({
    where: { id: teamId },
    select: {
      assignedJurors: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
  const jurors = team?.assignedJurors ?? [];
  if (jurors.length === 0) return [];

  await tx.team.update({
    where: { id: teamId },
    data: { assignedJurors: { set: [] } },
  });
  await tx.jurorAssignmentAuditLog.createMany({
    data: jurors.map(({ id }) => ({
      action: ManualJurorAssignmentAction.UNASSIGN,
      actorUserId,
      teamId,
      jurorId: id,
      previousJurorId: id,
      notes: 'Retiro automático: el equipo fue rechazado.',
    })),
  });

  return jurors.map(({ id, firstName, lastName }) => ({
    id,
    nombre: `${firstName} ${lastName}`.trim(),
  }));
}

/** Campos del aviso al administrador; vacío si no se retiró a nadie. */
export function rejectionNotice(released: ReleasedJuror[]) {
  if (released.length === 0) return {};
  return {
    juradosRetirados: released,
    avisoAsignacion: `El equipo fue rechazado y se le retiraron ${released.length} jurado(s). Si se vuelve a confirmar, hay que asignarle jurados de nuevo.`,
  };
}
