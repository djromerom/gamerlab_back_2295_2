import { JurorCategory, JurorType } from '@prisma/client';

/**
 * Categoría y tipo de jurado de todo profesor (ARK-139). Senior es solo para
 * profesores (decisión del 23 de octubre) y por defecto son jurados oficiales.
 */
export const PROFESSOR_JUROR_PROFILE = {
  jurorCategory: JurorCategory.SENIOR,
  jurorType: JurorType.OFFICIAL,
} as const;

export const PROFESSOR_MUST_BE_SENIOR_MESSAGE =
  'Un profesor siempre es jurado Senior; solo se puede cambiar su tipo.';
