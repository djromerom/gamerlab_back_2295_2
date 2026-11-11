import {
  DEFAULT_WEIGHTS,
  effectiveWeights,
  reportedFairScore,
  scoreForNrcAverage,
  snapshotWeighting,
} from './final-score';

/** HU-34 (ARK-196). El cálculo con valores conocidos se prueba contra la vista: final-score.db.spec.ts. */
describe('final-score (HU-34)', () => {
  it('por defecto: 60 % profesores, 40 % jurados junior', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ seniorPct: 60, juniorPct: 40 });
    expect(effectiveWeights(null, false)).toEqual({
      seniorPct: 60,
      juniorPct: 40,
    });
  });

  it('una edición congelada sin ponderado sigue en 50/50', () => {
    expect(effectiveWeights(null, true)).toEqual({
      seniorPct: 50,
      juniorPct: 50,
    });
  });

  it('el ponderado de la edición manda', () => {
    const own = { seniorPct: 70, juniorPct: 30 };
    expect(effectiveWeights(own, false)).toEqual(own);
    expect(effectiveWeights(own, true)).toEqual(own);
  });

  it('el ranking informa la ponderación que aplicó la vista', () => {
    expect(snapshotWeighting(null, [])).toEqual({
      configured: false,
      seniorPct: 60,
      juniorPct: 40,
    });
    expect(
      snapshotWeighting(null, [{ legacyFinalScoreRule: true }]),
    ).toMatchObject({ seniorPct: 50, juniorPct: 50 });
  });

  describe('reportedFairScore («Calificación Feria»)', () => {
    it('usa la nota de la vista', () => {
      expect(
        reportedFairScore({ finalScore: 4, legacyFinalScoreRule: false }, 3),
      ).toBe(4);
    });

    it('sin nota en una edición vigente: null, no un promedio parcial', () => {
      expect(
        reportedFairScore({ finalScore: null, legacyFinalScoreRule: false }, 3),
      ).toBeNull();
    });

    it('sin nota en una edición congelada: lo que mostraba antes', () => {
      expect(
        reportedFairScore({ finalScore: null, legacyFinalScoreRule: true }, 3),
      ).toBe(3);
    });
  });

  describe('scoreForNrcAverage', () => {
    it('edición vigente: la nota de la vista, o nada si está en proceso', () => {
      expect(
        scoreForNrcAverage({ finalScore: 4, legacyFinalScoreRule: false }, 2),
      ).toBe(4);
      expect(
        scoreForNrcAverage(
          { finalScore: null, legacyFinalScoreRule: false },
          2,
        ),
      ).toBeNull();
    });

    it('edición congelada: no cambia', () => {
      expect(
        scoreForNrcAverage({ finalScore: 4, legacyFinalScoreRule: true }, 2),
      ).toBe(2);
    });
  });
});
