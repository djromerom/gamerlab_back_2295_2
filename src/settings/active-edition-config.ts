import { EditionStatus, Prisma } from '@prisma/client';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';

/**
 * Filtro de la configuración del evento (`configuracion_evento`) de la edición ACTIVA.
 *
 * Hay una fila por edición. Quien lea un interruptor del evento (evaluaciones abiertas,
 * inscripciones, ranking...) debe usar este filtro: un `findFirst()` sin filtro devuelve la fila
 * de otra edición y el interruptor del panel de administración, que escribe en la de la edición
 * activa, no tiene efecto (ARK-123).
 */
export const ACTIVE_EDITION_CONFIG_WHERE = {
  edition: ACTIVE_EDITION_WHERE,
} satisfies Prisma.EventConfigurationWhereInput;
