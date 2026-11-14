/**
 * HU-23: cálculo de la presencia de un jurado que ya hizo check-in. Funciones puras (sin BD) para
 * probarlas con horas fijas y para que el panel de seguimiento (HU-12) las reutilice.
 *
 * Son solo indicadores: no mueven ni quitan grupos. El administrador decide si suma un suplente.
 */

/** Parámetros por edición, en minutos (`configuracion_evento`). */
export interface PresenceSettings {
  /** Cada cuánto se le pregunta "¿Sigues en la feria?" (60). */
  promptEveryMinutes: number;
  /** Minutos para responder antes de quedar "presencia sin confirmar" (15). */
  responseWindowMinutes: number;
  /** Minutos sin guardar ni enviar evaluaciones para quedar "posible salida" (45). */
  inactivityMinutes: number;
}

export const DEFAULT_PRESENCE_SETTINGS: PresenceSettings = {
  promptEveryMinutes: 60,
  responseWindowMinutes: 15,
  inactivityMinutes: 45,
};

/** Indicadores que muestra el panel. Un jurado puede tener los dos o ninguno. */
export const PRESENCE_INDICATORS = [
  'PRESENCE_UNCONFIRMED',
  'POSSIBLE_LEFT',
] as const;
export type PresenceIndicator = (typeof PRESENCE_INDICATORS)[number];

export interface PresenceSignals {
  /** Llegada registrada en la mesa de escarapelas (HU-11). */
  checkedInAt: Date;
  /** Último "Sigo aquí"; null si no ha respondido desde la llegada. */
  lastConfirmedAt: Date | null;
  /** Último borrador guardado o evaluación enviada en la edición; null si ninguno. */
  lastActivityAt: Date | null;
}

export interface PresenceState {
  /** Cuándo toca (o tocó) la próxima pregunta. */
  nextPromptAt: Date;
  /** La pregunta ya debe estar en pantalla. */
  promptDue: boolean;
  /** Desde cuándo cuenta como "presencia sin confirmar" si no responde. */
  unconfirmedAt: Date;
  /** Desde cuándo cuenta como "posible salida" si no hay actividad. */
  possibleLeftAt: Date;
  indicators: PresenceIndicator[];
}

const MINUTE_MS = 60_000;
const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * MINUTE_MS);
const latest = (...dates: (Date | null)[]) =>
  new Date(
    Math.max(
      ...dates.filter((d): d is Date => d !== null).map((d) => d.getTime()),
    ),
  );

/**
 * Estado de presencia de un jurado con check-in en el instante `now`.
 *
 * - La pregunta llega `promptEveryMinutes` después de la última confirmación (o de la llegada).
 * - Si pasan `responseWindowMinutes` más sin responder: "presencia sin confirmar".
 * - Si pasan `inactivityMinutes` desde la última actividad (o desde la llegada, si aún no hay
 *   ninguna) sin guardar ni enviar evaluaciones: "posible salida". Responder "Sigo aquí" no
 *   cuenta como actividad: son dos señales distintas.
 */
export function computePresence(
  signals: PresenceSignals,
  settings: PresenceSettings,
  now: Date,
): PresenceState {
  const promptBase = latest(signals.checkedInAt, signals.lastConfirmedAt);
  const nextPromptAt = addMinutes(promptBase, settings.promptEveryMinutes);
  const unconfirmedAt = addMinutes(
    nextPromptAt,
    settings.responseWindowMinutes,
  );

  const activityBase = latest(signals.checkedInAt, signals.lastActivityAt);
  const possibleLeftAt = addMinutes(activityBase, settings.inactivityMinutes);

  const indicators: PresenceIndicator[] = [];
  if (now >= unconfirmedAt) indicators.push('PRESENCE_UNCONFIRMED');
  if (now >= possibleLeftAt) indicators.push('POSSIBLE_LEFT');

  return {
    nextPromptAt,
    promptDue: now >= nextPromptAt,
    unconfirmedAt,
    possibleLeftAt,
    indicators,
  };
}
