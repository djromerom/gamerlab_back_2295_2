import { PrismaService } from 'src/prisma/prisma.service';
import { seesAllProfessors } from './professor-panel-query.service';

/**
 * BG-63 (ARK-263, decisión del 2026-11-17): el profesor solo ve los equipos
 * históricos de sus NRC; el Administrador los ve todos. `HistoricalMemberNrc.nrcId`
 * es el id del NRC vivo copiado al archivar (sin FK), así que se compara con los
 * NRC del profesor en cualquier feria (activos o no: el histórico no se pierde
 * si luego se desactiva el NRC).
 *
 * Devuelve los ids de los NRC del profesor, o `null` si ve todos (Administrador).
 */
export async function ownedNrcIds(
  prisma: Pick<PrismaService, 'nRC'>,
  professorId: string,
  roleId?: number,
): Promise<number[] | null> {
  if (seesAllProfessors(roleId)) return null;
  const nrcs = await prisma.nRC.findMany({
    where: { professorId },
    select: { id: true },
  });
  return nrcs.map((n) => n.id);
}

/**
 * Filtro de `HistoricalMemberNrc.nrcId` para el alcance del usuario y el NRC
 * pedido. `undefined`: sin filtro (Administrador sin NRC). Un NRC pedido que no
 * es del profesor no devuelve nada.
 */
export function historicalNrcIdFilter(
  owned: number[] | null,
  nrcId?: number,
): number | { in: number[] } | undefined {
  if (nrcId !== undefined) {
    return owned === null || owned.includes(nrcId) ? nrcId : { in: [] };
  }
  return owned === null ? undefined : { in: owned };
}

/** ¿El NRC histórico entra en el alcance (para mostrar sus códigos en la fila)? */
export function inHistoricalScope(
  id: number,
  owned: number[] | null,
  nrcId?: number,
): boolean {
  return (
    (nrcId === undefined || id === nrcId) &&
    (owned === null || owned.includes(id))
  );
}
