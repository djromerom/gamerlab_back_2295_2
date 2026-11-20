import { BadRequestException } from '@nestjs/common';
import { MinigameGame } from '@prisma/client';
import {
  MINIGAME_ALIAS_INVALID,
  MINIGAME_ALIAS_PERSONAL_DATA,
  MINIGAME_RECORD_INVALID,
  MINIGAME_SCORE_IMPOSSIBLE,
  SCORE_CAP,
  assertPossibleScore,
  normalizeAlias,
  normalizeTrack,
} from './minigame-record-rules';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { code: string })
      .code;
  }
  return undefined;
};

describe('HU-52: reglas de los récords de los minijuegos', () => {
  describe('pista', () => {
    it('Arkadash tiene un solo récord global, con o sin pista', () => {
      expect(normalizeTrack(MinigameGame.ARKADASH)).toBe('global');
      expect(normalizeTrack(MinigameGame.ARKADASH, ' Global ')).toBe('global');
      expect(
        codeOf(() => normalizeTrack(MinigameGame.ARKADASH, 'piano-1')),
      ).toBe(MINIGAME_RECORD_INVALID);
    });

    it('Arkad Jam usa <instrumento>-<índice>, como la clave local del front', () => {
      expect(normalizeTrack(MinigameGame.ARKAD_JAM, 'guitarra-3')).toBe(
        'guitarra-3',
      );
      expect(normalizeTrack(MinigameGame.ARKAD_JAM, ' PIANO-07 ')).toBe(
        'piano-7',
      );
      expect(normalizeTrack(MinigameGame.ARKAD_JAM, 'bateria-0')).toBe(
        'bateria-0',
      );
    });

    it.each([
      undefined,
      '',
      'global',
      'flauta-1',
      'piano',
      'piano-50',
      'piano-1-2',
      'piano-123',
    ])('Arkad Jam rechaza la pista %p', (track) => {
      expect(codeOf(() => normalizeTrack(MinigameGame.ARKAD_JAM, track))).toBe(
        MINIGAME_RECORD_INVALID,
      );
    });
  });

  describe('alias', () => {
    it.each([
      ['Pixel', 'Pixel'],
      ['  Ñoño   Gamer ', 'Ñoño Gamer'],
      ['ana_99', 'ana_99'],
      ['J.D-2026', 'J.D-2026'],
      ['abc', 'abc'],
      ['abcdefghijkl', 'abcdefghijkl'],
    ])('acepta %p como %p', (alias, expected) => {
      expect(normalizeAlias(alias)).toBe(expected);
    });

    it.each([
      'ab',
      '  a  ',
      'abcdefghijklm',
      'ana@uni',
      '<script>',
      'hola!',
      '😀😀😀',
      '',
    ])('rechaza %p (largo o caracteres)', (alias) => {
      expect(codeOf(() => normalizeAlias(alias))).toBe(MINIGAME_ALIAS_INVALID);
    });

    it.each(['200123456', 'yo 300123', '300 123 4567', '30-01-23-45'])(
      'rechaza %p porque parece un código, documento o teléfono',
      (alias) => {
        expect(codeOf(() => normalizeAlias(alias))).toBe(
          MINIGAME_ALIAS_PERSONAL_DATA,
        );
      },
    );

    it('acepta números cortos, como un año', () => {
      expect(normalizeAlias('Neo 2026')).toBe('Neo 2026');
    });
  });

  describe('tope por juego', () => {
    it('acepta de 1 al tope de cada juego', () => {
      for (const game of Object.values(MinigameGame)) {
        expect(() => assertPossibleScore(game, 1)).not.toThrow();
        expect(() => assertPossibleScore(game, SCORE_CAP[game])).not.toThrow();
      }
    });

    it.each([
      [MinigameGame.ARKADASH, 0],
      [MinigameGame.ARKADASH, -5],
      [MinigameGame.ARKADASH, SCORE_CAP.ARKADASH + 1],
      [MinigameGame.ARKAD_JAM, SCORE_CAP.ARKAD_JAM + 1],
      [MinigameGame.ARKAD_JAM, 10.5],
    ])('rechaza en %s el puntaje imposible %p', (game, score) => {
      expect(codeOf(() => assertPossibleScore(game, score))).toBe(
        MINIGAME_SCORE_IMPOSSIBLE,
      );
    });
  });
});
