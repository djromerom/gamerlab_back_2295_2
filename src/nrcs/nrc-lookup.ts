import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Resuelve códigos de NRC a ids restringiendo a una edición. Un mismo código
 * puede existir en varias ferias; un integrante solo debe vincularse al NRC de
 * la edición de su equipo. `missing` se calcula por conjunto de códigos (no por
 * longitud) para que códigos repetidos no enmascaren uno inexistente.
 */
export async function findNrcIdsByCodes(
  tx: Prisma.TransactionClient | PrismaService,
  codes: number[],
  editionId: number,
): Promise<{ ids: number[]; missing: number[] }> {
  const records = await tx.nRC.findMany({
    where: { code: { in: codes }, editionId, isActive: true },
    select: { id: true, code: true },
  });
  const found = new Set(records.map((r) => r.code));
  return {
    ids: records.map((r) => r.id),
    missing: [...new Set(codes)].filter((c) => !found.has(c)),
  };
}
