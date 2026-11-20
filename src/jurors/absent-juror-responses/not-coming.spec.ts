import { notComingSince } from './not-coming';

const at = (time: string) => new Date(`2026-11-26T${time}:00.000-05:00`);
const response = (
  id: number,
  jurorId: string,
  result: 'ON_THE_WAY' | 'CANNOT_ATTEND' | 'NO_RESPONSE',
  time: string,
) => ({ id, jurorId, result, recordedAt: at(time) });

describe('notComingSince (HU-44)', () => {
  it('la última respuesta «No podrá asistir», sin check-in, deja al jurado como que no vendrá', () => {
    const result = notComingSince(
      [
        response(1, 'a', 'ON_THE_WAY', '09:00'),
        response(2, 'a', 'CANNOT_ATTEND', '09:30'),
      ],
      [],
    );
    expect([...result]).toEqual([['a', at('09:30')]]);
  });

  it('una respuesta informativa posterior la deja sin efecto', () => {
    for (const later of ['ON_THE_WAY', 'NO_RESPONSE'] as const) {
      expect(
        notComingSince(
          [
            response(1, 'a', 'CANNOT_ATTEND', '09:30'),
            response(2, 'a', later, '09:40'),
          ],
          [],
        ).size,
      ).toBe(0);
    }
  });

  it('a la misma hora decide la respuesta registrada después (id mayor)', () => {
    expect(
      notComingSince(
        [
          response(2, 'a', 'CANNOT_ATTEND', '09:30'),
          response(1, 'a', 'ON_THE_WAY', '09:30'),
        ],
        [],
      ).has('a'),
    ).toBe(true);
  });

  it('un check-in activo o uno posterior (aunque se anule) la deja sin efecto', () => {
    const responses = [response(1, 'a', 'CANNOT_ATTEND', '09:30')];
    expect(
      notComingSince(responses, [
        { jurorId: 'a', checkedInAt: at('08:00'), isActive: true },
      ]).size,
    ).toBe(0);
    expect(
      notComingSince(responses, [
        { jurorId: 'a', checkedInAt: at('10:00'), isActive: false },
      ]).size,
    ).toBe(0);
  });

  it('una llegada anulada anterior a la respuesta no cuenta', () => {
    expect(
      notComingSince(
        [response(1, 'a', 'CANNOT_ATTEND', '09:30')],
        [{ jurorId: 'a', checkedInAt: at('08:00'), isActive: false }],
      ).has('a'),
    ).toBe(true);
  });

  it('cada jurado se evalúa por separado', () => {
    const result = notComingSince(
      [
        response(1, 'a', 'CANNOT_ATTEND', '09:30'),
        response(2, 'b', 'ON_THE_WAY', '09:30'),
      ],
      [{ jurorId: 'b', checkedInAt: at('10:00'), isActive: true }],
    );
    expect([...result.keys()]).toEqual(['a']);
  });
});
