import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * HU-34 (ARK-196, cierra P-02): parámetros de la nota final. El cálculo está en un solo lugar, la
 * vista `vw_team_final_scores` (prisma/views): aquí no se recalcula. Sus reglas:
 *
 *   nota final = (promedio de profesores × seniorPct + promedio de jurados junior × juniorPct) / 100
 *
 * - Profesores: evaluaciones con `isSenior` (los profesores que calificaron al grupo), todas.
 * - Jurados junior: `isSenior = false`, solo las 3 primeras (P-10, `counted-evaluations.ts`).
 * - Falta una de las dos partes: nota `null` («Nota en proceso», HU-20). Salvo externos, colegios
 *   N0 y ediciones congeladas (`legacyFinalScoreRule`), que siguen la regla anterior.
 *
 * Si cambian estos valores por defecto, cambian también los de la vista.
 */
export const DEFAULT_WEIGHTS = { seniorPct: 60, juniorPct: 40 } as const;

/** Por defecto de las ediciones congeladas: su nota no cambia con HU-34. */
const LEGACY_DEFAULT_WEIGHTS = { seniorPct: 50, juniorPct: 50 } as const;

interface Weights {
  seniorPct: number;
  juniorPct: number;
}

/** La ponderación que aplica la vista a una edición. */
export function effectiveWeights(
  weighting: Weights | null | undefined,
  legacyRule: boolean,
): Weights {
  const fallback = legacyRule ? LEGACY_DEFAULT_WEIGHTS : DEFAULT_WEIGHTS;
  return {
    seniorPct: weighting?.seniorPct ?? fallback.seniorPct,
    juniorPct: weighting?.juniorPct ?? fallback.juniorPct,
  };
}

interface FinalScoreRow {
  finalScore?: unknown;
  legacyFinalScoreRule?: boolean;
}

/** `weighting` de la respuesta del ranking, con lo que aplicó la vista a esas filas. */
export function snapshotWeighting(
  weighting: Weights | null,
  rows: readonly FinalScoreRow[],
): Weights & { configured: boolean } {
  const legacyRule = rows.some((r) => r.legacyFinalScoreRule === true);
  return {
    configured: weighting !== null,
    ...effectiveWeights(weighting, legacyRule),
  };
}

/** Notas de la vista por videojuego. */
export async function loadFinalScores(
  prisma: Pick<PrismaService, 'teamFinalScore'>,
  where: Prisma.TeamFinalScoreWhereInput,
) {
  const rows = await prisma.teamFinalScore.findMany({
    where,
    select: {
      videogameId: true,
      finalScore: true,
      legacyFinalScoreRule: true,
    },
  });
  return new Map(rows.map((r) => [r.videogameId, r]));
}

/** Edición con la regla de HU-34; las congeladas conservan lo que mostraban los reportes. */
const usesWeightedRule = (row?: FinalScoreRow): boolean =>
  row?.legacyFinalScoreRule === false;

const toScore = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/**
 * «Calificación Feria» de los reportes. Sin nota final, las ediciones vigentes devuelven `null`
 * («Nota en proceso»), no un promedio parcial; las congeladas, `rawAverage` como hasta ahora.
 * Sin fila en la vista, `null`: todo juego tiene fila salvo los que la vista excluye (equipo
 * rechazado, BG-43; no calificable, HU-39), que no tienen nota.
 */
export function reportedFairScore(
  row: FinalScoreRow | undefined,
  rawAverage: number,
): number | null {
  if (!row) return null;
  const score = toScore(row.finalScore);
  if (score !== null) return score;
  return usesWeightedRule(row) ? null : rawAverage;
}

/** Nota de un juego dentro del promedio por NRC. Las ediciones congeladas no cambian. */
export function scoreForNrcAverage(
  row: FinalScoreRow | undefined,
  rawAverage: number | null,
): number | null {
  if (!row) return null; // excluido de la vista (BG-43, HU-39): no cuenta en el promedio
  return usesWeightedRule(row) ? toScore(row?.finalScore) : rawAverage;
}
