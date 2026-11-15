import {
  BuildRankingInput,
  DEFAULT_PODIUM_SIZE,
  LevelRanking,
  ScoreRow,
  buildGroupRanking,
  inExternalGroup,
  parseLevel,
} from './ranking.logic';

/**
 * HU-38 (ARK-219): ranking y podio propio de los equipos externos.
 *
 * - Los equipos con la marca de externo (`isExternal`) no compiten en su nivel: forman el grupo
 *   «Externos», con su propio podio (mismo tamaño que el de los niveles, P-29).
 * - Un colegio (N0) sigue en su nivel aunque tenga la marca (HU-34).
 * - El desempate (P-05) y las 3 evaluaciones que cuentan son los mismos de los niveles; la nota de
 *   un externo cuenta solo a los jurados junior, como ya hace `vw_team_final_scores`.
 * - Quedan fuera, como en los niveles, los equipos inactivos, los de otra edición y los que no
 *   tienen código con nivel.
 */
export function buildExternalRanking(
  input: BuildRankingInput,
): LevelRanking | null {
  const scored: ScoreRow[] = [];
  const unscored: ScoreRow[] = [];

  for (const row of input.rows) {
    if (row.editionId !== input.editionId) continue;
    if (!input.teams.get(row.teamId)?.isActive) continue;
    const level = parseLevel(row.teamCode);
    if (level === null || !inExternalGroup(row, level)) continue;
    if (row.finalScore === null || row.finalScore === undefined)
      unscored.push(row);
    else scored.push(row);
  }

  if (scored.length === 0 && unscored.length === 0) return null;
  return buildGroupRanking(
    input,
    null,
    scored,
    unscored,
    input.podiumSize ?? DEFAULT_PODIUM_SIZE,
  );
}

/** Clave del grupo en el que compite una fila: su nivel o `EXT` (Externos). Null sin nivel. */
export function rankingGroupKey(
  row: Pick<ScoreRow, 'isExternal' | 'teamCode'>,
): string | null {
  const level = parseLevel(row.teamCode);
  if (level === null) return null;
  return inExternalGroup(row, level) ? 'EXT' : `N${level}`;
}
