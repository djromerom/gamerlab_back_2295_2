import { DRAFT_STATUS, draftStatusOf } from './evaluation-draft-status';
import { scoreError } from '../score-rules';

describe('Estado del borrador (HU-18, flujo A1)', () => {
  it('sin envío ni bloqueo: se puede continuar', () => {
    expect(draftStatusOf(false, undefined)).toEqual({
      status: DRAFT_STATUS.PENDING,
    });
  });

  it('bloqueado: NOT_ASSIGNED con el motivo', () => {
    expect(
      draftStatusOf(false, 'Este grupo no está asignado al evaluador'),
    ).toEqual({
      status: DRAFT_STATUS.NOT_ASSIGNED,
      blockedReason: 'Este grupo no está asignado al evaluador',
    });
  });

  it('ya enviado gana sobre bloqueado', () => {
    expect(
      draftStatusOf(true, 'Este grupo no está asignado al evaluador'),
    ).toEqual({
      status: DRAFT_STATUS.ALREADY_SUBMITTED,
    });
  });
});

describe('Reglas del puntaje (compartidas con el envío)', () => {
  it.each([0, 5, 4.35, 2.5])('acepta %p', (score) => {
    expect(scoreError(1, score)).toBeNull();
  });

  it.each([-1, 5.01, NaN, Infinity, '4', null])(
    'rechaza %p por rango o tipo',
    (score) => {
      expect(scoreError(1, score)).toMatch(/out of range/);
    },
  );

  it('rechaza más de 2 decimales', () => {
    expect(scoreError(1, 4.355)).toMatch(/2 decimales/);
  });
});
