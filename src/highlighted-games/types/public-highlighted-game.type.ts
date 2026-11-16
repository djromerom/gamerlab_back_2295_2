// HU-41 (ARK-229): un juego destacado tal como lo ve la landing (GET /highlighted-games).
// Solo datos públicos del juego: nada de integrantes, correos ni datos personales.
export interface PublicHighlightedGame {
  /** Id del destacado (juego_destacado). */
  id: number;
  name: string;
  teamName: string;
  edition: { id: number; year: number; semester: number; title: string };
  logoUrl: string | null;
  /** El juego tiene archivo (.zip) para jugarlo. */
  hasGameFile: boolean;
  /** Qué abrir para jugar: el videojuego en vivo o el histórico. */
  play: { type: 'live' | 'historical'; id: number };
}
