import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveFairScheduleDto } from './dto/save-fair-schedule.dto';
import {
  DEFAULT_FAIR_TIMES,
  fairInstant,
  fairPhase,
  isAlertReached,
  isControlReached,
  scheduleProblem,
} from './fair-schedule';

const schedule = { ...DEFAULT_FAIR_TIMES, fairDate: '2026-11-26' };
/** Bogotá es UTC-5: las 10:00 de Bogotá son las 15:00 UTC. */
const at = (bogotaTime: string, date = '2026-11-26') =>
  new Date(`${date}T${bogotaTime}:00.000-05:00`);

describe('fairInstant', () => {
  it('convierte la hora de Bogotá a UTC, con minutos', () => {
    expect(fairInstant('2026-11-26', '10:30').toISOString()).toBe(
      '2026-11-26T15:30:00.000Z',
    );
  });
});

describe('fairPhase (P-09)', () => {
  it.each([
    ['07:59', 'BEFORE_ALERT'],
    ['09:59', 'BEFORE_ALERT'],
    ['10:00', 'ALERT'],
    ['10:59', 'ALERT'],
    ['11:00', 'CONTROL'],
    ['11:59', 'CONTROL'],
    ['12:00', 'CLOSED'],
  ])('a las %s está en %s', (time, phase) => {
    expect(fairPhase(schedule, at(time))).toBe(phase);
  });

  it('sin fecha de feria no hay alerta, aunque sean las 11:00', () => {
    expect(
      fairPhase({ ...DEFAULT_FAIR_TIMES, fairDate: null }, at('11:00')),
    ).toBe('NOT_CONFIGURED');
  });

  it('las 11:00 de otro día anterior a la feria no marcan a nadie', () => {
    expect(fairPhase(schedule, at('11:00', '2026-11-25'))).toBe('BEFORE_ALERT');
  });

  it('los días posteriores a la feria sigue cerrado', () => {
    expect(fairPhase(schedule, at('09:00', '2026-11-27'))).toBe('CLOSED');
  });

  it('respeta un cronograma distinto', () => {
    const custom = { ...schedule, alertTime: '09:30', controlTime: '10:15' };
    expect(fairPhase(custom, at('09:30'))).toBe('ALERT');
    expect(fairPhase(custom, at('10:15'))).toBe('CONTROL');
  });

  it('solo muestra listas desde la alerta y marca ausentes desde el control', () => {
    expect(isAlertReached('BEFORE_ALERT')).toBe(false);
    expect(isAlertReached('NOT_CONFIGURED')).toBe(false);
    expect(isAlertReached('ALERT')).toBe(true);
    expect(isControlReached('ALERT')).toBe(false);
    expect(isControlReached('CONTROL')).toBe(true);
    expect(isControlReached('CLOSED')).toBe(true);
  });
});

describe('scheduleProblem', () => {
  it('acepta el cronograma por defecto', () => {
    expect(scheduleProblem(schedule)).toBeNull();
  });

  it('rechaza una fecha que no existe', () => {
    expect(scheduleProblem({ ...schedule, fairDate: '2026-02-30' })).toMatch(
      /fecha/,
    );
  });

  it.each([
    ['alerta antes del inicio', { alertTime: '07:00' }],
    ['control igual a la alerta', { controlTime: '10:00' }],
    ['cierre antes del control', { closeTime: '10:30' }],
  ])('rechaza %s', (_name, change) => {
    expect(scheduleProblem({ ...schedule, ...change })).toMatch(/orden/);
  });
});

describe('SaveFairScheduleDto', () => {
  const errors = async (body: object) =>
    (await validate(plainToInstance(SaveFairScheduleDto, body))).map(
      (error) => error.property,
    );

  it('acepta el cronograma completo', async () => {
    expect(await errors(schedule)).toEqual([]);
  });

  it('exige todos los campos', async () => {
    expect((await errors({})).sort()).toEqual([
      'alertTime',
      'closeTime',
      'controlTime',
      'fairDate',
      'startTime',
    ]);
  });

  it.each(['8:00', '24:00', '10:60', '10:00:00', 'diez'])(
    'rechaza la hora %s',
    async (alertTime) => {
      expect(await errors({ ...schedule, alertTime })).toEqual(['alertTime']);
    },
  );

  it('rechaza una fecha con otro formato', async () => {
    expect(await errors({ ...schedule, fairDate: '26/11/2026' })).toEqual([
      'fairDate',
    ]);
  });
});
