import { AssignmentWarningCode } from './assignment-rules.types';

/**
 * ARK-262 (BG-62): texto fijo en español de cada advertencia de HU-08, para mostrar el código sin
 * el código crudo (por ejemplo en la nota «Advertencias aceptadas: TEAM_UNDER_MIN.» del
 * historial). Es un `Record` completo: si se agrega un código nuevo, no compila hasta que tenga
 * su texto. Los mensajes con datos (nombres, cantidades) siguen saliendo de `assignment-rules.ts`.
 */
export const ASSIGNMENT_WARNING_TEXTS: Record<AssignmentWarningCode, string> = {
  JUROR_OVER_LIMIT: 'El jurado quedaría con más grupos del máximo recomendado',
  JUROR_MIXED_LEVELS: 'El jurado quedaría con grupos de distintos niveles',
  TEAM_UNDER_MIN: 'El grupo quedaría con menos de 3 jurados',
  NRC_CONFLICT:
    'El jurado dicta un NRC de los integrantes del equipo (conflicto de interés)',
  VALIDATION_UNAVAILABLE: 'No se pudieron comprobar las reglas de asignación',
};

/** El texto de un código, o el mismo código si no es uno conocido (datos viejos o de otra versión). */
export function warningText(code: string): string {
  return (
    (ASSIGNMENT_WARNING_TEXTS as Record<string, string | undefined>)[code] ??
    code
  );
}
