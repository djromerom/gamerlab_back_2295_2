import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * HU-31 (ARK-167): NRC de un integrante. Cada código debe ser un NRC activo de `editionId` (la
 * edición del equipo, que al inscribirse es la activa; un mismo código puede existir en varias
 * ferias) y no puede haber dos NRC de la misma materia. Se pueden elegir varias materias (un
 * proyecto puede pertenecer a varias).
 * Responde 400 con `field: 'nrc'` para que el front lo muestre en el selector.
 */
export async function resolveMemberNrcs(
  tx: Prisma.TransactionClient | PrismaService,
  codes: Array<number | string>,
  editionId: number,
): Promise<number[]> {
  const asText = [...new Set(codes.map((c) => String(c).trim()))];
  if (asText.length === 0)
    throw new BadRequestException({
      statusCode: 400,
      message: 'Cada integrante debe tener al menos un NRC',
      field: 'nrc',
    });
  const valid = asText.filter((c) => /^\d+$/.test(c)).map(Number);
  const records = await tx.nRC.findMany({
    where: { code: { in: valid }, editionId, isActive: true },
    select: {
      id: true,
      code: true,
      subjectId: true,
      subject: { select: { name: true } },
    },
  });
  const found = new Set(records.map((r) => r.code));
  const missing = asText.filter(
    (c) => !/^\d+$/.test(c) || !found.has(Number(c)),
  );
  if (missing.length > 0)
    throw new BadRequestException({
      statusCode: 400,
      message: `Estos NRC no existen en la edición activa: ${missing.join(', ')}`,
      field: 'nrc',
    });

  const bySubject = new Map<number, { name: string; codes: number[] }>();
  for (const r of records) {
    const entry = bySubject.get(r.subjectId) ?? {
      name: r.subject.name,
      codes: [],
    };
    entry.codes.push(r.code);
    bySubject.set(r.subjectId, entry);
  }
  const repeated = [...bySubject.values()].find((s) => s.codes.length > 1);
  if (repeated)
    throw new BadRequestException({
      statusCode: 400,
      message: `Elige un solo NRC por materia: ${repeated.name} tiene ${repeated.codes.join(' y ')}`,
      field: 'nrc',
    });

  return records.map((r) => r.id);
}
