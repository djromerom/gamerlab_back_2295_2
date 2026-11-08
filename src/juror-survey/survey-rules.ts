/**
 * HU-17 (ARK-183): campos de la encuesta (P-13) y la regla de «terminó de evaluar».
 * Sin acceso a la BD: lo usan el servicio, el resumen y el Excel.
 */
export const SURVEY_FIELDS = [
  {
    key: 'loginEase',
    label: 'Facilidad para iniciar sesión y entrar a la plataforma',
  },
  { key: 'groupsClarity', label: 'Claridad para saber qué grupos evaluar' },
  {
    key: 'gradingEase',
    label: 'Facilidad para calificar (formulario de evaluación)',
  },
  {
    key: 'stability',
    label: 'Estabilidad y rapidez (no perdí datos, no se cerró la sesión)',
  },
  {
    key: 'fairOrganization',
    label: 'Organización de la feria (escarapela, registro y avisos)',
  },
  { key: 'overall', label: 'Experiencia general' },
] as const;

export type SurveyFieldKey = (typeof SURVEY_FIELDS)[number]['key'];
export type SurveyScores = Record<SurveyFieldKey, number>;

export const MIN_SURVEY_SCORE = 1;
export const MAX_SURVEY_SCORE = 5;
export const MAX_SURVEY_COMMENTS = 1000;

/** Por qué la encuesta no está disponible (null = disponible). */
export type SurveyUnavailableReason =
  | 'NO_ACTIVE_EDITION'
  | 'NOT_EDITION_JUROR'
  | 'NO_ASSIGNED_TEAMS'
  | 'PENDING_EVALUATIONS'
  | 'ALREADY_ANSWERED';

export interface SurveyProgress {
  isEditionJuror: boolean;
  assigned: number;
  evaluated: number;
  answered: boolean;
}

/**
 * Disponible cuando el usuario es jurado de la edición, tiene al menos un grupo asignado y envió
 * la evaluación de todos (los borradores no son evaluaciones). Se responde una sola vez.
 */
export function surveyUnavailableReason(
  progress: SurveyProgress,
): SurveyUnavailableReason | null {
  if (progress.answered) return 'ALREADY_ANSWERED';
  if (!progress.isEditionJuror) return 'NOT_EDITION_JUROR';
  if (progress.assigned === 0) return 'NO_ASSIGNED_TEAMS';
  if (progress.evaluated < progress.assigned) return 'PENDING_EVALUATIONS';
  return null;
}

export const UNAVAILABLE_MESSAGES: Record<SurveyUnavailableReason, string> = {
  NO_ACTIVE_EDITION: 'No hay una edición activa.',
  NOT_EDITION_JUROR: 'La encuesta es para los jurados de la edición activa.',
  NO_ASSIGNED_TEAMS: 'Aún no tienes grupos asignados.',
  PENDING_EVALUATIONS:
    'La encuesta se habilita cuando envíes las evaluaciones de todos tus grupos asignados.',
  ALREADY_ANSWERED: 'Ya respondiste la encuesta de esta edición. ¡Gracias!',
};

export interface FieldSummary {
  key: SurveyFieldKey;
  label: string;
  average: number | null;
  /** Cuántas respuestas dieron 1, 2, 3, 4 y 5. */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Promedio (2 decimales) y distribución de cada campo. */
export function summarizeFields(responses: SurveyScores[]): FieldSummary[] {
  return SURVEY_FIELDS.map(({ key, label }) => {
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    for (const response of responses) {
      const score = response[key];
      total += score;
      const bucket = String(score) as keyof typeof distribution;
      if (bucket in distribution) distribution[bucket]++;
    }
    const average =
      responses.length === 0
        ? null
        : Math.round((total / responses.length) * 100) / 100;
    return { key, label, average, distribution };
  });
}
