import {
  checkTeamGrade,
  FinalScoreRow,
  formatFairDay,
  resolveReleaseMoment,
  studentGrade,
} from './final-grade.logic';

const row = (over: Partial<FinalScoreRow> = {}): FinalScoreRow => ({
  teamId: 1,
  teamCode: 'N2-ISI-014',
  teamName: 'Pixel',
  isExternal: false,
  videogameName: 'Stella',
  finalScore: 4.126,
  juniorEvaluations: 3,
  seniorEvaluations: 1,
  ...over,
});

describe('HU-20 · reglas de la nota final del estudiante', () => {
  describe('resolveReleaseMoment: hora de cierre del día de la feria (hora de Colombia)', () => {
    const START = new Date('2026-11-26T13:00:00Z'); // 8:00 del 26-nov en Colombia

    it('sin cronograma: 12:00 del día en que inicia la edición', () => {
      const moment = resolveReleaseMoment(START, null);
      expect(moment).toEqual({
        at: new Date('2026-11-26T17:00:00.000Z'),
        fairDate: '2026-11-26',
        releaseTime: '12:00',
        fromSchedule: false,
      });
    });

    it('sin cronograma usa el día en Colombia aunque en UTC ya sea el siguiente', () => {
      expect(
        resolveReleaseMoment(
          new Date('2026-11-27T03:00:00Z'),
          null,
        ).at.toISOString(),
      ).toBe('2026-11-26T17:00:00.000Z');
    });

    it('con cronograma (HU-12): su fecha y su hora de cierre', () => {
      const moment = resolveReleaseMoment(START, {
        fairDate: new Date('2026-11-27T00:00:00Z'),
        closeTime: '12:30',
      });
      expect(moment).toEqual({
        at: new Date('2026-11-27T17:30:00.000Z'),
        fairDate: '2026-11-27',
        releaseTime: '12:30',
        fromSchedule: true,
      });
    });

    it('formatea el día para el mensaje', () => {
      expect(formatFairDay('2026-11-26')).toBe('26/11/2026');
    });
  });

  describe('checkTeamGrade', () => {
    it('grupo completo: sin motivos', () => {
      expect(checkTeamGrade(row())).toEqual({ inProcess: false, reasons: [] });
    });

    it('sin nota de los profesores: en proceso', () => {
      expect(checkTeamGrade(row({ seniorEvaluations: 0 }))).toEqual({
        inProcess: true,
        reasons: ['MISSING_PROFESSOR_SCORE'],
      });
    });

    it('sin jurados junior: en proceso (y menos de 3)', () => {
      expect(checkTeamGrade(row({ juniorEvaluations: 0 }))).toEqual({
        inProcess: true,
        reasons: ['MISSING_JUNIOR_SCORE', 'LESS_THAN_MIN_EVALUATIONS'],
      });
    });

    it('menos de 3 evaluaciones de jurados: solo aviso, no queda en proceso', () => {
      expect(
        checkTeamGrade(row({ juniorEvaluations: 1, seniorEvaluations: 1 })),
      ).toEqual({
        inProcess: false,
        reasons: ['LESS_THAN_MIN_EVALUATIONS'],
      });
    });

    describe('BG-68 (ARK-270): el mínimo de 3 cuenta junior y senior', () => {
      it.each([
        [3, 0],
        [2, 1],
        [1, 2],
      ])(
        '%i junior y %i senior suman 3: no sale marcado «menos de 3»',
        (juniorEvaluations, seniorEvaluations) => {
          const check = checkTeamGrade(
            row({
              juniorEvaluations,
              seniorEvaluations: seniorEvaluations || 1,
            }),
          );
          expect(check.reasons).not.toContain('LESS_THAN_MIN_EVALUATIONS');
          expect(check.inProcess).toBe(false);
        },
      );

      it('3 evaluaciones senior y ninguna junior: sigue en proceso por la nota junior, pero no «menos de 3»', () => {
        const check = checkTeamGrade(
          row({ juniorEvaluations: 0, seniorEvaluations: 3 }),
        );
        expect(check.reasons).toEqual(['MISSING_JUNIOR_SCORE']);
        expect(check.inProcess).toBe(true);
      });

      it.each([
        [2, 0],
        [1, 1],
        [0, 2],
      ])(
        '%i junior y %i senior suman menos de 3: sí se marca',
        (juniorEvaluations, seniorEvaluations) => {
          expect(
            checkTeamGrade(row({ juniorEvaluations, seniorEvaluations }))
              .reasons,
          ).toContain('LESS_THAN_MIN_EVALUATIONS');
        },
      );

      it('no cambia cuándo queda en proceso: eso sigue dependiendo de las notas que faltan', () => {
        // 1 junior + 2 senior = 3: sin aviso y con nota
        expect(
          checkTeamGrade(row({ juniorEvaluations: 1, seniorEvaluations: 2 })),
        ).toEqual({ inProcess: false, reasons: [] });
        // sin nota final en la vista: en proceso aunque sumen 3
        expect(
          checkTeamGrade(
            row({
              juniorEvaluations: 1,
              seniorEvaluations: 2,
              finalScore: null,
            }),
          ).inProcess,
        ).toBe(true);
      });
    });

    it('colegio (N0): no tiene jurados junior (P-08) y no queda en proceso por eso', () => {
      expect(
        checkTeamGrade(row({ teamCode: 'N0-COL-001', juniorEvaluations: 0 })),
      ).toEqual({ inProcess: false, reasons: [] });
    });

    it('colegio sin nota de los profesores: en proceso', () => {
      expect(
        checkTeamGrade(
          row({
            teamCode: 'N0-COL-001',
            juniorEvaluations: 0,
            seniorEvaluations: 0,
          }),
        ),
      ).toEqual({ inProcess: true, reasons: ['MISSING_PROFESSOR_SCORE'] });
    });

    it('colegio con marca de externo: igual cuenta a los profesores', () => {
      expect(
        checkTeamGrade(
          row({
            teamCode: 'N0-COL-001',
            isExternal: true,
            juniorEvaluations: 0,
            seniorEvaluations: 0,
          }),
        ).reasons,
      ).toEqual(['MISSING_PROFESSOR_SCORE']);
    });

    it('equipo externo: cuenta solo la nota de los jurados, no le falta la del profesor', () => {
      expect(
        checkTeamGrade(row({ isExternal: true, seniorEvaluations: 0 })),
      ).toEqual({
        inProcess: false,
        reasons: [],
      });
    });

    it('sin nota final en la vista: en proceso', () => {
      expect(checkTeamGrade(row({ finalScore: null })).inProcess).toBe(true);
    });

    it('sin fila (equipo sin videojuego): en proceso', () => {
      expect(checkTeamGrade(null).inProcess).toBe(true);
    });
  });

  describe('studentGrade', () => {
    it('no liberada: no se muestra ninguna nota', () => {
      expect(studentGrade(false, row())).toEqual({
        status: 'NOT_RELEASED',
        finalGrade: null,
      });
    });

    it('liberada y completa: la nota con 2 decimales', () => {
      expect(studentGrade(true, row())).toEqual({
        status: 'AVAILABLE',
        finalGrade: 4.13,
      });
    });

    it('liberada pero sin nota del profesor: «Nota en proceso», sin nota parcial', () => {
      expect(studentGrade(true, row({ seniorEvaluations: 0 }))).toEqual({
        status: 'IN_PROCESS',
        finalGrade: null,
      });
    });

    it('liberada y sin fila: en proceso', () => {
      expect(studentGrade(true, null)).toEqual({
        status: 'IN_PROCESS',
        finalGrade: null,
      });
    });
  });
});
