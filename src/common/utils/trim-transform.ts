import { TransformFnParams } from 'class-transformer';

/** Quita los espacios de los extremos de un texto; cualquier otro valor pasa igual. */
export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Como `trimString`, pero un texto vacío (o de solo espacios) se convierte en `undefined`, para
 * que un campo opcional enviado como `""` cuente como no enviado (BG-05: `logoUrl: ""`).
 */
export const trimToUndefined = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Correo normalizado: sin espacios en los extremos y en minúsculas. */
export const normalizeEmailValue = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
