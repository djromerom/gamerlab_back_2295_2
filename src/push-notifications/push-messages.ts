import { PushNoticeInput } from './push-notice';

/**
 * HU-37: los únicos tres avisos de esta versión (confirmados por Allison el 7-nov). Son fijos a
 * propósito: se ven en la pantalla bloqueada, así que no llevan nombres de equipos, de jurados ni
 * cantidades.
 */
export const ASSIGNMENT_CHANGED_NOTICE: PushNoticeInput = {
  title: 'Cambios en tus equipos',
  body: 'Hubo cambios en los equipos que debes calificar. Entra a ARKAD para revisarlos.',
};

export const ARRIVAL_REMINDER_NOTICE: PushNoticeInput = {
  title: 'Recordatorio de llegada',
  body: 'Aún no registramos tu llegada a la feria. Pasa por la mesa de escarapelas.',
};

export const PENDING_EVALUATIONS_NOTICE: PushNoticeInput = {
  title: 'Equipos por calificar',
  body: 'Aún tienes equipos pendientes por calificar. Entra a ARKAD para completarlos.',
};
