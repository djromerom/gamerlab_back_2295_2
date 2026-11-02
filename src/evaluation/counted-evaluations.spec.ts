import { countedEvaluations, countedTotal } from './counted-evaluations';

describe('countedEvaluations (P-10)', () => {
  it('devuelve las 3 primeras por hora de envío, sin importar el orden de entrada', () => {
    const evals = [
      { id: 5, date: new Date('2026-11-26T15:00:00Z') },
      { id: 1, date: new Date('2026-11-26T13:00:00Z') },
      { id: 9, date: new Date('2026-11-26T16:00:00Z') },
      { id: 3, date: new Date('2026-11-26T14:00:00Z') },
    ];
    expect(countedEvaluations(evals).map((e) => e.id)).toEqual([1, 3, 5]);
    expect(evals[0].id).toBe(5); // no muta la entrada
  });

  it('si dos tienen la misma hora, desempata por id', () => {
    const d = new Date('2026-11-26T13:00:00Z');
    const evals = [
      { id: 7, date: d },
      { id: 2, date: d },
      { id: 4, date: d },
      { id: 1, date: d },
    ];
    expect(countedEvaluations(evals).map((e) => e.id)).toEqual([1, 2, 4]);
  });

  it('countedTotal tiene tope 3', () => {
    expect([0, 2, 3, 6].map(countedTotal)).toEqual([0, 2, 3, 3]);
  });
});
