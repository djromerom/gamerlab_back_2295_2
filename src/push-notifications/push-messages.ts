import { PUSH_BODY_MAX_LENGTH, PushNoticeInput } from './push-notice';

/**
 * HU-37: avisos fijos (confirmados por Allison el 7-nov). Se ven en la pantalla bloqueada, así que
 * no llevan nombres de equipos ni de jurados. El único que lleva datos es el de grupos nuevos
 * (HU-51, Allison, 19-nov): la cantidad y los códigos de los grupos, nunca sus nombres.
 */
export const ASSIGNMENT_CHANGED_NOTICE: PushNoticeInput = {
  title: 'Cambios en tus equipos',
  body: 'Hubo cambios en los equipos que debes calificar. Entra a ARKAD para revisarlos.',
};

/** HU-51: al tocarlo se abre la lista de equipos por calificar del jurado. */
export const PENDING_GRADING_PATH = '/pendientes-calificar';

const TEAMS_ASSIGNED_CLOSING = ' Entra a ARKAD para calificarlos.';

function groups(count: number): string {
  return count === 1 ? '1 grupo nuevo' : `${count} grupos nuevos`;
}

/**
 * HU-51 (ARK-292): «Te asignaron N grupos nuevos: códigos». Si los códigos no caben en el mensaje
 * se muestran los primeros y «y N más». Recibe al menos un código.
 */
export function teamsAssignedNotice(teamCodes: string[]): PushNoticeInput {
  const codes = [...new Set(teamCodes)].sort((a, b) => a.localeCompare(b));
  const intro = `Te asignaron ${groups(codes.length)}: `;
  const fits = (text: string) =>
    text.length + TEAMS_ASSIGNED_CLOSING.length <= PUSH_BODY_MAX_LENGTH;

  let shown = codes.length;
  let list = `${codes.join(', ')}.`;
  while (shown > 1 && !fits(intro + list)) {
    shown -= 1;
    list = `${codes.slice(0, shown).join(', ')} y ${codes.length - shown} más.`;
  }
  return {
    title: `Te asignaron ${groups(codes.length)}`,
    body: `${intro}${list}${TEAMS_ASSIGNED_CLOSING}`,
    url: PENDING_GRADING_PATH,
  };
}

export const ARRIVAL_REMINDER_NOTICE: PushNoticeInput = {
  title: 'Recordatorio de llegada',
  body: 'Aún no registramos tu llegada a la feria. Pasa por la mesa de escarapelas.',
};

export const PENDING_EVALUATIONS_NOTICE: PushNoticeInput = {
  title: 'Equipos por calificar',
  body: 'Aún tienes equipos pendientes por calificar. Entra a ARKAD para completarlos.',
};
