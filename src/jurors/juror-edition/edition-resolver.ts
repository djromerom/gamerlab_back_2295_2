import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EditionSummary } from './juror-edition.types';
import { findActiveEdition } from 'src/editions/active-edition';

type EditionClient = Pick<PrismaService, 'edition'>;

const editionSelect = {
  id: true,
  title: true,
  status: true,
  year: true,
  semester: true,
  endsAt: true,
} as const;

export interface ResolvedEdition {
  id: number;
  title: string;
  status: EditionStatus;
  year: number;
  semester: number;
  endsAt: Date;
}

/** La edición pedida o, si no se envía, la edición activa. 404 si no existe. */
export async function resolveEdition(
  prisma: EditionClient,
  editionId?: number,
): Promise<ResolvedEdition> {
  const edition = editionId
    ? await prisma.edition.findUnique({
        where: { id: editionId },
        select: editionSelect,
      })
    : await findActiveEdition(prisma);
  if (!edition) {
    throw new NotFoundException(
      editionId
        ? `La edición ${editionId} no existe`
        : 'No hay una edición activa',
    );
  }
  return edition;
}

/**
 * Qué ediciones aceptan cambios en su lista de jurados (decidido el 2026-11-02, nota 1 de la
 * revisión de #218):
 * - ACTIVE: siempre (también después de la feria, hasta que se active otra).
 * - INACTIVE: solo si aún no terminó (`endsAt` en el futuro): una edición que se está
 *   preparando. Las anteriores (en producción, la 1 a la 4 están INACTIVE) son de solo lectura.
 * - ARCHIVED: nunca.
 * Las de solo lectura conservan su lista para los reportes.
 */
function readOnlyReason(
  edition: Pick<ResolvedEdition, 'status' | 'endsAt'>,
  now: Date,
): string | null {
  if (edition.status === EditionStatus.ACTIVE) return null;
  if (edition.status === EditionStatus.ARCHIVED) {
    return 'La edición está archivada: su lista de jurados es de solo lectura';
  }
  if (edition.endsAt.getTime() <= now.getTime()) {
    return 'La edición ya terminó: su lista de jurados es de solo lectura';
  }
  return null;
}

export function isWritable(
  edition: Pick<ResolvedEdition, 'status' | 'endsAt'>,
  now: Date = new Date(),
): boolean {
  return readOnlyReason(edition, now) === null;
}

/** 400 si la lista de jurados de la edición es de solo lectura. */
export function assertWritable(
  edition: Pick<ResolvedEdition, 'status' | 'endsAt'>,
  now: Date = new Date(),
): void {
  const reason = readOnlyReason(edition, now);
  if (reason) throw new BadRequestException(reason);
}

/** La edición inmediatamente anterior por año y semestre (10, 20, 30). 404 si no hay. */
export async function findPreviousEdition(
  prisma: EditionClient,
  edition: ResolvedEdition,
): Promise<{ id: number }> {
  const previous = await prisma.edition.findFirst({
    where: {
      OR: [
        { year: { lt: edition.year } },
        { year: edition.year, semester: { lt: edition.semester } },
      ],
    },
    orderBy: [{ year: 'desc' }, { semester: 'desc' }],
    select: { id: true },
  });
  if (!previous) {
    throw new NotFoundException(
      'No hay una edición anterior de la cual traer jurados',
    );
  }
  return previous;
}

export function toEditionSummary(edition: ResolvedEdition): EditionSummary {
  return {
    id: edition.id,
    title: edition.title,
    status: edition.status,
    writable: isWritable(edition),
  };
}
