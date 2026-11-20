import { studentGrade } from './final-grade.logic';

/** HU-39 (ARK-209): el estudiante de un equipo no calificable no tiene nota. */
describe('studentGrade con equipo no calificable', () => {
  const row = {
    teamId: 1,
    teamCode: 'N1-ABC-101',
    teamName: 'Los Pixeles',
    isExternal: false,
    videogameName: 'Juego',
    finalScore: 4.5,
    juniorEvaluations: 3,
    seniorEvaluations: 1,
  };

  it.each([true, false])('responde NOT_GRADABLE (liberada: %s)', (released) => {
    expect(studentGrade(released, row, 'NOT_GRADABLE')).toEqual({
      status: 'NOT_GRADABLE',
      finalGrade: null,
    });
  });

  it.each([true, false])('equipo rechazado: REJECTED (liberada: %s)', (released) => {
    expect(studentGrade(released, row, 'REJECTED')).toEqual({
      status: 'REJECTED',
      finalGrade: null,
    });
  });

  it('sin la marca sigue igual que antes', () => {
    expect(studentGrade(true, row)).toEqual({
      status: 'AVAILABLE',
      finalGrade: 4.5,
    });
  });
});
