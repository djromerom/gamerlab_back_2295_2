/**
 * HU-39 (ARK-209): equipo «no calificable», el presentador externo que es un equipo.
 *
 * - Sale en la galería como cualquier equipo, pero no recibe jurados, no se califica y no tiene
 *   nota: la vista `vw_team_final_scores` no lo incluye, así que tampoco entra al ranking, a los
 *   desempates, a la nota del estudiante ni a las exportaciones de notas.
 * - Solo el Administrador lo marca o desmarca (servicio `ManageExternalPresenters`, de HU-33), en
 *   equipos de la edición activa.
 * - Al marcarlo se le retiran los jurados (bitácora y aviso push, como al rechazar un equipo en
 *   ARK-158). Sus evaluaciones no se borran: dejan de contar y vuelven si se quita la marca. Los
 *   jurados no vuelven solos.
 * - Recibe el certificado de presentador externo, no el de participación.
 */
export const TEAM_NOT_GRADABLE = 'TEAM_NOT_GRADABLE';
export const CERTIFICATE_TEAM_NOT_GRADABLE = 'CERTIFICATE_TEAM_NOT_GRADABLE';
export const CERTIFICATE_TEAM_GRADABLE = 'CERTIFICATE_TEAM_GRADABLE';

export const NOT_GRADABLE_MESSAGE =
  'Este equipo es un presentador externo: no se califica ni recibe jurados.';

export const NOT_GRADABLE_RELEASE_NOTE =
  'Retiro automático: el equipo se marcó como no calificable (presentador externo).';

/** Texto del aviso al administrador cuando se retiraron jurados al marcar el equipo. */
export function notGradableReleaseNotice(
  released: { id: string; nombre: string }[],
) {
  if (released.length === 0) return {};
  return {
    juradosRetirados: released,
    avisoAsignacion: `El equipo se marcó como no calificable y se le retiraron ${released.length} jurado(s). Si se quita la marca, hay que asignarle jurados de nuevo.`,
  };
}
