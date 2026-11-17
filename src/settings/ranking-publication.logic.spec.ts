import {
  canPublishRanking,
  isRankingPublished,
} from './ranking-publication.logic';

/** BG-67 (ARK-268): una sola regla de «notas publicadas». */
describe('isRankingPublished', () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])(
    'showRanking=%s y showFinalGrade=%s ⇒ %s',
    (showRanking, showFinalGrade, expected) => {
      expect(isRankingPublished({ showRanking, showFinalGrade })).toBe(
        expected,
      );
    },
  );

  it('sin configuración de la edición activa el ranking está oculto', () => {
    expect(isRankingPublished(null)).toBe(false);
    expect(isRankingPublished(undefined)).toBe(false);
  });
});

describe('canPublishRanking', () => {
  it('publicar exige la nota final liberada', () => {
    expect(canPublishRanking(true, { showFinalGrade: false })).toBe(false);
    expect(canPublishRanking(true, { showFinalGrade: true })).toBe(true);
  });

  it('ocultar se puede siempre', () => {
    expect(canPublishRanking(false, { showFinalGrade: false })).toBe(true);
    expect(canPublishRanking(false, { showFinalGrade: true })).toBe(true);
  });
});
