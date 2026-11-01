import {
  bogotaCutoff,
  buildHourlyBuckets,
  parseFairDate,
  todayInBogota,
} from './hourly-buckets';

// Las horas de Bogotá se escriben con su offset para que la prueba no dependa del huso del equipo.
const at = (local: string) => new Date(`2026-11-26T${local}-05:00`);

describe('hourly-buckets (HU-21)', () => {
  it('el corte de las 10:00 en Bogotá es las 15:00 UTC', () => {
    expect(bogotaCutoff('2026-11-26', 10).toISOString()).toBe(
      '2026-11-26T15:00:00.000Z',
    );
  });

  it('una evaluación enviada exactamente a la hora entra en ese corte', () => {
    const buckets = buildHourlyBuckets([at('10:00:00')], '2026-11-26');
    expect(buckets.find((b) => b.hour === 9)?.received).toBe(0);
    expect(buckets.find((b) => b.hour === 10)?.received).toBe(1);
  });

  it('es acumulado y solo cuentan 3 aunque haya más', () => {
    const dates = [
      at('08:30:00'),
      at('09:10:00'),
      at('09:40:00'),
      at('10:20:00'),
      at('11:59:59'),
    ];
    expect(buildHourlyBuckets(dates, '2026-11-26')).toEqual([
      { hour: 8, received: 0, counted: 0 },
      { hour: 9, received: 1, counted: 1 },
      { hour: 10, received: 3, counted: 3 },
      { hour: 11, received: 4, counted: 3 },
      { hour: 12, received: 5, counted: 3 },
    ]);
  });

  it('las de otro día posterior no entran; las de un día anterior sí', () => {
    const dates = [
      new Date('2026-11-25T20:00:00-05:00'),
      new Date('2026-11-27T08:00:00-05:00'),
    ];
    const buckets = buildHourlyBuckets(dates, '2026-11-26');
    expect(buckets.every((b) => b.received === 1)).toBe(true);
  });

  it('hoy en Bogotá: a las 23:00 locales del 25 sigue siendo 25 aunque en UTC sea 26', () => {
    expect(todayInBogota(new Date('2026-11-26T04:00:00Z'))).toBe('2026-11-25');
    expect(todayInBogota(new Date('2026-11-26T05:00:00Z'))).toBe('2026-11-26');
  });

  it('rechaza fechas que no existen', () => {
    expect(parseFairDate('2026-02-30')).toBeNull();
    expect(parseFairDate('2026-13-01')).toBeNull();
    expect(parseFairDate('26-11-2026')).toBeNull();
    expect(parseFairDate('2026-11-26')).toEqual({
      year: 2026,
      month: 11,
      day: 26,
    });
  });
});
