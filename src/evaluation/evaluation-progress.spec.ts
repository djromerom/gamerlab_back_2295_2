import { countProgress } from './evaluation-progress';

describe('countProgress', () => {
  it('cuenta solo evaluaciones de jurados asignados', () => {
    expect(countProgress(['a', 'b'], ['a', 'x'])).toEqual({
      completed: 1,
      assigned: 2,
    });
  });
  it('ignora duplicados y nunca supera assigned', () => {
    const r = countProgress(['a', 'a'], ['a', 'a', 'b']);
    expect(r).toEqual({ completed: 1, assigned: 1 });
  });
  it('sin asignados no hay progreso', () => {
    expect(countProgress([], ['a'])).toEqual({ completed: 0, assigned: 0 });
  });
});
