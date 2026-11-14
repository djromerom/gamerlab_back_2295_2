import { BadRequestException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveEdition } from 'src/jurors/juror-edition/edition-resolver';
import { findActiveEdition } from './active-edition';

type EditionClient = Pick<PrismaService, 'edition'>;

/**
 * ARK-129 (HU-26): la edición de un listado de equipos o estudiantes. Solo la ACTIVE acepta
 * inscripciones y cambios; las demás se consultan como historial (`readOnly`).
 */
export interface ListEdition {
  id: number;
  title: string;
  status: EditionStatus;
  readOnly: boolean;
}

/**
 * La edición pedida (404 si no existe) o, sin `editionId`, la activa. Sin edición activa devuelve
 * `null`: el listado sale vacío en lugar de mezclar ediciones o fallar (la galería es pública).
 */
export async function resolveListEdition(
  prisma: EditionClient,
  editionId?: number,
): Promise<ListEdition | null> {
  if (editionId === undefined) {
    const active = await findActiveEdition(prisma);
    return active ? toListEdition(active) : null;
  }
  return toListEdition(await resolveEdition(prisma, editionId));
}

function toListEdition(edition: {
  id: number;
  title: string;
  status: EditionStatus;
}): ListEdition {
  return {
    id: edition.id,
    title: edition.title,
    status: edition.status,
    readOnly: edition.status !== EditionStatus.ACTIVE,
  };
}

/** `?editionId=`: entero positivo u omitido. Devuelve `undefined` si no se envió. */
export function parseEditionIdParam(raw?: string): number | undefined | 'invalid' {
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) return 'invalid';
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : 'invalid';
}

/**
 * ARK-132 (BG-19): `?editionId=` de un listado ya validado. `undefined` = la edición activa;
 * 400 si no es un entero positivo (mismo mensaje que `GET /teams`).
 */
export function editionIdQuery(raw?: string): number | undefined {
  const editionId = parseEditionIdParam(raw);
  if (editionId === 'invalid') {
    throw new BadRequestException('editionId debe ser un número entero positivo');
  }
  return editionId;
}
