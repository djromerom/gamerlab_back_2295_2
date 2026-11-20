import {
  DEFAULT_PRESENCE_SETTINGS,
  PresenceSignals,
  computePresence,
} from './presence-status';

const ARRIVAL = new Date('2026-11-26T13:00:00.000Z'); // 8:00 en Colombia
const at = (minutesAfterArrival: number) =>
  new Date(ARRIVAL.getTime() + minutesAfterArrival * 60_000);

const signals = (extra: Partial<PresenceSignals> = {}): PresenceSignals => ({
  checkedInAt: ARRIVAL,
  lastConfirmedAt: null,
  lastActivityAt: null,
  ...extra,
});

const state = (now: number, extra: Partial<PresenceSignals> = {}) =>
  computePresence(signals(extra), DEFAULT_PRESENCE_SETTINGS, at(now));

describe('computePresence (HU-23)', () => {
  it('usa 60, 15 y 45 minutos por defecto', () => {
    expect(DEFAULT_PRESENCE_SETTINGS).toEqual({
      promptEveryMinutes: 60,
      responseWindowMinutes: 15,
      inactivityMinutes: 45,
    });
  });

  it('recién llegado: sin pregunta ni indicadores', () => {
    const s = state(10, { lastActivityAt: at(5) });
    expect(s.promptDue).toBe(false);
    expect(s.nextPromptAt).toEqual(at(60));
    expect(s.indicators).toEqual([]);
  });

  it('pregunta a los 60 minutos de la llegada', () => {
    expect(state(59, { lastActivityAt: at(30) }).promptDue).toBe(false);
    expect(state(60, { lastActivityAt: at(30) }).promptDue).toBe(true);
  });

  it('sin responder en 15 minutos queda "presencia sin confirmar" (justo en el límite)', () => {
    expect(state(74, { lastActivityAt: at(70) }).indicators).toEqual([]);
    expect(state(75, { lastActivityAt: at(70) }).indicators).toEqual([
      'PRESENCE_UNCONFIRMED',
    ]);
  });

  it('"Sigo aquí" reinicia la cuenta desde la confirmación', () => {
    const s = state(100, { lastConfirmedAt: at(70), lastActivityAt: at(90) });
    expect(s.nextPromptAt).toEqual(at(130));
    expect(s.promptDue).toBe(false);
    expect(s.indicators).toEqual([]);
  });

  it('45 minutos sin actividad desde la llegada: "posible salida"', () => {
    expect(state(44).indicators).toEqual([]);
    expect(state(45).indicators).toEqual(['POSSIBLE_LEFT']);
  });

  it('la última evaluación reinicia la cuenta de inactividad', () => {
    expect(
      state(80, { lastActivityAt: at(40), lastConfirmedAt: at(62) }).indicators,
    ).toEqual([]);
    expect(
      state(85, { lastActivityAt: at(40), lastConfirmedAt: at(62) }).indicators,
    ).toEqual(['POSSIBLE_LEFT']);
  });

  it('responder "Sigo aquí" no cuenta como actividad', () => {
    const s = state(50, { lastConfirmedAt: at(49) });
    expect(s.indicators).toEqual(['POSSIBLE_LEFT']);
  });

  it('una actividad anterior a la llegada no cuenta', () => {
    const s = computePresence(
      signals({ lastActivityAt: at(-120) }),
      DEFAULT_PRESENCE_SETTINGS,
      at(30),
    );
    expect(s.possibleLeftAt).toEqual(at(45));
  });

  it('puede tener los dos indicadores a la vez', () => {
    expect(state(80).indicators).toEqual([
      'PRESENCE_UNCONFIRMED',
      'POSSIBLE_LEFT',
    ]);
  });

  it('respeta parámetros configurados', () => {
    const s = computePresence(
      signals({ lastActivityAt: at(0) }),
      {
        promptEveryMinutes: 30,
        responseWindowMinutes: 5,
        inactivityMinutes: 20,
      },
      at(35),
    );
    expect(s.nextPromptAt).toEqual(at(30));
    expect(s.indicators).toEqual(['PRESENCE_UNCONFIRMED', 'POSSIBLE_LEFT']);
  });
});
