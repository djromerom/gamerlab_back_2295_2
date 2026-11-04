import { ForbiddenException } from '@nestjs/common';
import { EventConfiguration, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';

/**
 * Filtro de la configuración del evento (`configuracion_evento`) de la edición ACTIVA.
 *
 * Hay una fila por edición. Quien lea un interruptor del evento (evaluaciones abiertas,
 * inscripciones, ranking...) debe usar este filtro: un `findFirst()` sin filtro devuelve la fila
 * de otra edición y el interruptor del panel de administración, que escribe en la de la edición
 * activa, no tiene efecto (ARK-123, BG-21 / ARK-134).
 */
export const ACTIVE_EDITION_CONFIG_WHERE = {
  edition: ACTIVE_EDITION_WHERE,
} satisfies Prisma.EventConfigurationWhereInput;

/** Código del 404 cuando la edición activa (o ninguna) no tiene configuración del evento. */
export const EVENT_CONFIGURATION_NOT_FOUND = 'EVENT_CONFIGURATION_NOT_FOUND';

export const EVALUATIONS_CLOSED_MESSAGE =
  'Las evaluaciones no están habilitadas en este momento.';

type ConfigClient = Pick<PrismaService, 'eventConfiguration'>;

/**
 * ARK-134: la configuración del evento de la edición activa, o `null` si no hay edición activa o
 * si no tiene fila. Nunca la de otra edición. La fila nace con la edición y se crea al activarla
 * (ARK-123), así que `null` solo ocurre entre ediciones o con datos anteriores a ARK-123.
 */
export function findActiveEditionConfig(
  prisma: ConfigClient,
): Promise<EventConfiguration | null> {
  return prisma.eventConfiguration.findFirst({ where: ACTIVE_EDITION_CONFIG_WHERE });
}

/**
 * ARK-134: puerta «evaluaciones abiertas» de los jurados (calificar, pendientes y calificados).
 * Sin configuración de la edición activa se considera cerrada: 403, igual que si estuviera cerrada.
 */
export async function assertEvaluationsOpen(prisma: ConfigClient): Promise<void> {
  const config = await findActiveEditionConfig(prisma);
  if (!config?.evaluationsOpen) {
    throw new ForbiddenException(EVALUATIONS_CLOSED_MESSAGE);
  }
}
