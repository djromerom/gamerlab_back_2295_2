import { BadRequestException, ConflictException } from '@nestjs/common';
import { PROFESSOR_ROLE_NAME } from '../juror-badges/juror-label';
import { PrismaService } from '../prisma/prisma.service';
import {
  ENROLLABLE_ROLE_NAMES,
  professorsOfEdition,
} from './jurors-of-edition';

/**
 * HU-28 (ARK-150): quién se puede inscribir por correo en una edición.
 *
 * - Jurado externo (rol Jurado): siempre.
 * - Profesor (rol Profesor, senior por P-07): solo si **no** tiene un NRC activo en esa
 *   edición. Si lo tiene ya es jurado automático (`professorsOfEdition`) y una fila lo
 *   duplicaría: 409. Un NRC inactivo o de otra edición no cuenta.
 * - Cualquier otro rol: 400.
 */
export async function assertEnrollable(
  prisma: PrismaService,
  user: { id: string; role: { name: string } },
  editionId: number,
): Promise<void> {
  if (!ENROLLABLE_ROLE_NAMES.includes(user.role.name)) {
    throw new BadRequestException(
      'La cuenta no tiene el rol Jurado ni Profesor',
    );
  }
  if (user.role.name !== PROFESSOR_ROLE_NAME) return;

  const automatic = await prisma.user.count({
    where: { ...professorsOfEdition(editionId), id: user.id },
  });
  if (automatic > 0) {
    throw new ConflictException(
      'El profesor ya es jurado de esta edición porque tiene un NRC activo en ella',
    );
  }
}
