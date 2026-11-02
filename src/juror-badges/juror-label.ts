import { JurorCategory, Prisma } from '@prisma/client';

export const JUROR_ROLE_NAME = 'Jurado';
export const PROFESSOR_ROLE_NAME = 'Profesor';

/** Datos mínimos para mostrar a un jurado (escarapela y check-in). Sin correo. */
export const jurorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  jurorCategory: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

export type LabeledJuror = Prisma.UserGetPayload<{
  select: typeof jurorSelect;
}>;

/** Jurados y profesores activos: los dos califican y llevan escarapela. */
export function eligibleJurorsWhere(ids?: string[]): Prisma.UserWhereInput {
  return {
    isActive: true,
    role: { name: { in: [JUROR_ROLE_NAME, PROFESSOR_ROLE_NAME] } },
    ...(ids ? { id: { in: ids } } : {}),
  };
}

/** Todo profesor cuenta como senior (P-07); el resto usa su categoría. */
export function jurorCategoryLabel(juror: LabeledJuror): string {
  const category =
    juror.jurorCategory ??
    (juror.role.name === PROFESSOR_ROLE_NAME ? JurorCategory.SENIOR : null);
  if (category === JurorCategory.SENIOR) return 'Senior';
  if (category === JurorCategory.JUNIOR) return 'Junior';
  return 'Sin categoría';
}

export function jurorFullName(juror: LabeledJuror): string {
  return `${juror.firstName ?? ''} ${juror.lastName ?? ''}`.trim();
}
