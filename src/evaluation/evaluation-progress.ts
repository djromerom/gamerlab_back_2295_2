/**
 * Progreso de evaluación: evaluaciones de jurados actualmente asignados
 * dividido por asignaciones vigentes. Una nota de un jurado desasignado no
 * cuenta en el progreso (sí cuenta en el promedio).
 */
export function countProgress(
  assignedJurorIds: string[],
  scoredJurorIds: string[],
): { completed: number; assigned: number } {
  const assigned = new Set(assignedJurorIds);
  const scored = new Set(scoredJurorIds);
  let completed = 0;
  for (const id of scored) if (assigned.has(id)) completed++;
  return { completed, assigned: assigned.size };
}
