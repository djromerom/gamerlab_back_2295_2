import { BadRequestException } from '@nestjs/common';
import { MinigameGame } from '@prisma/client';
import { isOffensiveAlias } from './minigame-alias-offensive';

/*
 HU-52 (ARK-315): reglas de los récords globales de los minijuegos de la landing.

 - Arkadash tiene un solo récord global (pista `global`).
 - Arkad Jam tiene uno por canción: la pista es `<instrumento>-<índice>`, la misma que usa el
   front en su récord local (`arkadjam-guitarra-3`). El nivel va implícito en la canción.
 - El tope por juego rechaza puntajes imposibles. Se calculó con el código de los juegos:
   · Arkad Jam: la canción más larga da como máximo 78 930 puntos (todas perfectas, combo ×4 y
     todas las sostenidas completas); el tope deja margen para canciones nuevas.
   · Arkadash: 1 punto por torre (2 con «al ras») a 1,2 torres por segundo como máximo; 10 000
     son más de una hora de vuelo sin fallar.
*/

export const TOP_SIZE = 5;

export const SCORE_CAP: Record<MinigameGame, number> = {
  ARKADASH: 10_000,
  ARKAD_JAM: 100_000,
};

export const ARKADASH_TRACK = 'global';
export const JAM_INSTRUMENTS = ['guitarra', 'piano', 'bateria'] as const;
export const JAM_MAX_SONGS = 50;
const JAM_TRACK_PATTERN = /^(guitarra|piano|bateria)-(\d{1,2})$/;

export const ALIAS_MIN_LENGTH = 3;
export const ALIAS_MAX_LENGTH = 12;
// Letras (con tildes y ñ), números, espacio, punto, guion y guion bajo.
const ALIAS_PATTERN = /^[\p{L}\p{N} ._-]+$/u;
// Como en los avisos push: 6 dígitos o más seguidos son un código estudiantil, una cédula o un teléfono.
const DOCUMENT_OR_PHONE_PATTERN = /\d{6,}|(?:\d[ .-]?){7,}/;

export const MINIGAME_RECORD_INVALID = 'MINIGAME_RECORD_INVALID';
export const MINIGAME_ALIAS_INVALID = 'MINIGAME_ALIAS_INVALID';
export const MINIGAME_ALIAS_PERSONAL_DATA = 'MINIGAME_ALIAS_PERSONAL_DATA';
export const MINIGAME_SCORE_IMPOSSIBLE = 'MINIGAME_SCORE_IMPOSSIBLE';
export const MINIGAME_ALIAS_OFFENSIVE = 'MINIGAME_ALIAS_OFFENSIVE';
export const MINIGAME_RECORD_NOT_FOUND = 'MINIGAME_RECORD_NOT_FOUND';

function invalid(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, code, message });
}

/** Devuelve la pista normalizada del juego o 400 si no existe. */
export function normalizeTrack(
  game: MinigameGame,
  track?: string | null,
): string {
  const value = track?.trim().toLowerCase() ?? '';
  if (game === MinigameGame.ARKADASH) {
    if (value && value !== ARKADASH_TRACK) {
      throw invalid(
        MINIGAME_RECORD_INVALID,
        'Arkadash tiene un solo récord: no lleva canción',
      );
    }
    return ARKADASH_TRACK;
  }
  const match = JAM_TRACK_PATTERN.exec(value);
  if (!match || Number(match[2]) >= JAM_MAX_SONGS) {
    throw invalid(
      MINIGAME_RECORD_INVALID,
      'La canción de Arkad Jam va como <instrumento>-<número>, por ejemplo guitarra-3',
    );
  }
  return `${match[1]}-${Number(match[2])}`;
}

/**
 * Limpia el alias (espacios repetidos) y lo valida: 3 a 12 caracteres, sin datos personales y sin
 * palabras ofensivas (minigame-alias-offensive.ts).
 */
export function normalizeAlias(alias: string): string {
  const value = (alias ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const length = [...value].length;
  if (
    length < ALIAS_MIN_LENGTH ||
    length > ALIAS_MAX_LENGTH ||
    !ALIAS_PATTERN.test(value)
  ) {
    throw invalid(
      MINIGAME_ALIAS_INVALID,
      `El alias lleva de ${ALIAS_MIN_LENGTH} a ${ALIAS_MAX_LENGTH} caracteres: letras, números, espacio, punto o guion`,
    );
  }
  if (DOCUMENT_OR_PHONE_PATTERN.test(value)) {
    throw invalid(
      MINIGAME_ALIAS_PERSONAL_DATA,
      'El alias se ve en la pantalla principal: no uses códigos, documentos ni teléfonos',
    );
  }
  if (isOffensiveAlias(value)) {
    throw invalid(
      MINIGAME_ALIAS_OFFENSIVE,
      'Elige otro alias: este no se puede mostrar en la pantalla principal',
    );
  }
  return value;
}

/** 400 si el puntaje no es posible en ese juego. */
export function assertPossibleScore(game: MinigameGame, score: number): void {
  if (!Number.isInteger(score) || score < 1 || score > SCORE_CAP[game]) {
    throw invalid(
      MINIGAME_SCORE_IMPOSSIBLE,
      `El puntaje de este juego va de 1 a ${SCORE_CAP[game]}`,
    );
  }
}
