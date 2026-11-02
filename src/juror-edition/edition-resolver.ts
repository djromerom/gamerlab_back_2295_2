import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EditionSummary } from './juror-edition.types';

type EditionClient = Pick<PrismaService, 'edition'>;

const editionSelect = {
  id: true,
  title: true,
  status: true,
  year: true,
  semester: true,
} as const;

export type ResolvedEdition = EditionSummary & {
  year: number;
  semester: number;
};

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
    : await prisma.edition.findFirst({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
        select: editionSelect,
      });
  if (!edition) {
    throw new NotFoundException(
      editionId
        ? `La edición ${editionId} no existe`
        : 'No hay una edición activa',
    );
  }
  return edition;
}

/** Las ediciones archivadas son de solo lectura: conservan su lista para los reportes. */
export function assertWritable(edition: ResolvedEdition): void {
  if (edition.status === EditionStatus.ARCHIVED) {
    throw new BadRequestException(
      'La edición está archivada: su lista de jurados es de solo lectura',
    );
  }
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
  return { id: edition.id, title: edition.title, status: edition.status };
}
