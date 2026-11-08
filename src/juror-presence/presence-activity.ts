import { PrismaService } from '../prisma/prisma.service';

type ActivityClient = Pick<PrismaService, 'evaluation'>;

/**
 * HU-23: última actividad de cada jurado en la edición = última evaluación enviada. La fecha
 * (`evaluacion.fecha`) la pone el servidor al guardar, así que no depende del reloj del jurado.
 *
 * Cuando exista el guardado de borradores en el servidor (HU-18), su última hora de guardado se
 * suma aquí con el mismo criterio (el máximo de las dos): es el único punto que hay que tocar.
 */
export async function lastActivityByJuror(
  prisma: ActivityClient,
  editionId: number,
  jurorIds: string[],
): Promise<Map<string, Date>> {
  if (jurorIds.length === 0) return new Map();
  const rows = await prisma.evaluation.groupBy({
    by: ['jurorId'],
    where: { editionId, jurorId: { in: jurorIds } },
    _max: { date: true },
  });
  const result = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.date) result.set(row.jurorId, row._max.date);
  }
  return result;
}
