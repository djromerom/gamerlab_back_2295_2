import { DEFAULT_PODIUM_SIZE, parseLevel } from '../ranking/ranking.logic';

/**
 * HU-48 (ARK-306): forma de cada fila de `GET /teams/final-score/by-n/:n` (ranking público).
 * Solo el podio de cada nivel y **sin ninguna nota** (ni la final, ni el desglose, ni los
 * puntajes de desempate). El ranking completo con notas sigue en `GET /ranking` (Administrador).
 */
export interface PublicPodiumRow {
  teamId: number;
  teamCode: string | null;
  teamName: string | null;
  isExternal: boolean;
  videogameId: number;
  videogameName: string | null;
  logoUrl: string | null;
  videogameLogoUrl: string | null;
  editionId: number;
  /** Nivel del equipo (N0 = 0, N1 = 1...), sacado del código. */
  level: number;
  /** Puesto dentro del nivel (1, 2 o 3), ya desempatado (HU-47). */
  levelPosition: number;
  /** Igual a `levelPosition`; se conserva porque el front lee `position`. */
  position: number;
}

type OrderedRow = Record<string, unknown> & {
  levelPosition?: number | null;
};

const str = (v: unknown) => (typeof v === 'string' ? v : null);

/**
 * Recibe las filas ya ordenadas por `RankingService.orderRows` (que pone `levelPosition` según el
 * ranking oficial de cada nivel) y deja solo los `podiumSize` primeros de cada nivel, con una lista
 * blanca de campos. Las filas sin puesto en su nivel (sin nota o sin nivel en el código) no salen.
 * El resultado va ordenado por nivel y puesto.
 */
export function toPublicPodium(
  rows: OrderedRow[],
  podiumSize = DEFAULT_PODIUM_SIZE,
): PublicPodiumRow[] {
  const podium: PublicPodiumRow[] = [];
  for (const r of rows) {
    const level = parseLevel(str(r.teamCode));
    const levelPosition = Number(r.levelPosition);
    if (level === null) continue;
    if (!Number.isInteger(levelPosition) || levelPosition < 1) continue;
    if (levelPosition > podiumSize) continue;
    podium.push({
      teamId: Number(r.teamId),
      teamCode: str(r.teamCode),
      teamName: str(r.teamName),
      isExternal: Boolean(r.isExternal),
      videogameId: Number(r.videogameId),
      videogameName: str(r.videogameName),
      logoUrl: str(r.logoUrl) ?? str(r.videogameLogoUrl),
      videogameLogoUrl: str(r.videogameLogoUrl),
      editionId: Number(r.editionId),
      level,
      levelPosition,
      position: levelPosition,
    });
  }
  return podium.sort(
    (a, b) => a.level - b.level || a.levelPosition - b.levelPosition,
  );
}
