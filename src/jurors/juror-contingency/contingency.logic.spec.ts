import { JurorCategory } from '@prisma/client';
import {
  ContingencyTeamInput,
  GroupJurorInput,
  SubstituteInput,
  countsForGroup,
  groupsAtRisk,
  suggestSubstitutes,
} from './contingency.logic';

const { JUNIOR, SENIOR } = JurorCategory;

const juror = (
  id: string,
  extra: Partial<GroupJurorInput> = {},
): GroupJurorInput => ({
  id,
  name: `Jurado ${id}`,
  category: JUNIOR,
  checkedIn: true,
  possibleLeft: false,
  evaluated: false,
  ...extra,
});

const team = (
  id: number,
  level: number,
  jurors: GroupJurorInput[],
): ContingencyTeamInput => ({
  id,
  teamCode: `N${level}-T-${id}`,
  teamName: `Equipo ${id}`,
  videogame: `Juego ${id}`,
  level,
  jurors,
});

const sub = (
  id: string,
  extra: Partial<SubstituteInput> = {},
): SubstituteInput => ({
  id,
  name: `Suplente ${id}`,
  category: JUNIOR,
  checkedIn: true,
  teams: [],
  ...extra,
});

const PRESENT = { basis: 'PRESENT' as const, minimum: 3 };

describe('contingencia: quién cuenta en un grupo (HU-14)', () => {
  it('antes de la hora de control cuentan todos los asignados', () => {
    expect(countsForGroup(juror('a', { checkedIn: false }), 'ASSIGNED')).toBe(
      true,
    );
    expect(
      groupsAtRisk(
        [
          team(1, 1, [
            juror('a', { checkedIn: false }),
            juror('b'),
            juror('c'),
          ]),
        ],
        {
          basis: 'ASSIGNED',
          minimum: 3,
        },
      ),
    ).toEqual([]);
  });

  it('desde la hora de control el ausente no cuenta y el grupo queda en riesgo', () => {
    const [group] = groupsAtRisk(
      [team(1, 1, [juror('a', { checkedIn: false }), juror('b'), juror('c')])],
      PRESENT,
    );
    expect(group).toMatchObject({
      teamId: 1,
      juradosContados: 2,
      faltantes: 1,
    });
    expect(group.jurados.find((j) => j.id === 'a')).toMatchObject({
      estado: 'ABSENT',
      cuenta: false,
    });
  });

  it('una evaluación hecha siempre cuenta, aunque el jurado no tenga llegada', () => {
    expect(
      countsForGroup(
        juror('a', { checkedIn: false, evaluated: true }),
        'PRESENT',
      ),
    ).toBe(true);
  });

  it('el jurado que llega tarde vuelve a contar: el grupo sale del riesgo', () => {
    const late = team(1, 1, [
      juror('a', { checkedIn: true }),
      juror('b'),
      juror('c'),
    ]);
    expect(groupsAtRisk([late], PRESENT)).toEqual([]);
  });

  it('el que se retira deja de contar solo donde no ha evaluado (HU-23)', () => {
    const left = { possibleLeft: true };
    const groups = groupsAtRisk(
      [
        team(1, 1, [juror('x', left), juror('b'), juror('c')]),
        team(2, 1, [
          juror('x', { ...left, evaluated: true }),
          juror('d'),
          juror('e'),
        ]),
      ],
      PRESENT,
    );
    expect(groups.map((g) => g.teamId)).toEqual([1]);
    expect(groups[0].jurados.find((j) => j.id === 'x')).toMatchObject({
      estado: 'LEFT',
      cuenta: false,
    });
  });

  it('el mínimo es un parámetro y se ordena de más a menos faltantes', () => {
    const groups = groupsAtRisk([team(1, 1, [juror('a')]), team(2, 1, [])], {
      basis: 'PRESENT',
      minimum: 2,
    });
    expect(groups.map((g) => [g.teamId, g.faltantes])).toEqual([
      [2, 2],
      [1, 1],
    ]);
  });
});

describe('contingencia: sugerencia de suplentes (HU-14)', () => {
  const absentSenior = juror('aus', { checkedIn: false, category: SENIOR });

  it('ordena por mismo nivel, misma categoría, menor carga, llegada y nombre', () => {
    const [group] = suggestSubstitutes(
      groupsAtRisk(
        [team(1, 2, [absentSenior, juror('b'), juror('c')])],
        PRESENT,
      ),
      [
        sub('otroNivel', { category: SENIOR, teams: [{ id: 50, level: 1 }] }),
        sub('junior'),
        sub('seniorCargado', {
          category: SENIOR,
          teams: [{ id: 51, level: 2 }],
        }),
        sub('seniorLibre', { category: SENIOR }),
        sub('seniorSinLlegar', { category: SENIOR, checkedIn: false }),
      ],
    );
    expect(group.sugeridos.map((s) => s.id)).toEqual(['seniorLibre']);
    expect(group.alternativas.map((s) => s.id)).toEqual([
      'seniorSinLlegar',
      'seniorCargado',
      'junior',
      'otroNivel',
    ]);
    expect(group.sinCubrir).toBe(0);
  });

  it('en un colegio (N0) solo propone seniors', () => {
    const [group] = suggestSubstitutes(
      groupsAtRisk([team(1, 0, [absentSenior])], PRESENT),
      [
        sub('j1'),
        sub('s1', { category: SENIOR }),
        sub('sinCategoria', { category: null }),
      ],
    );
    expect(group.sugeridos.map((s) => s.id)).toEqual(['s1']);
    expect(group.alternativas).toEqual([]);
    expect(group.sinCubrir).toBe(2);
  });

  it('reparte la carga: no le da todos los grupos al mismo suplente', () => {
    const groups = suggestSubstitutes(
      groupsAtRisk(
        [
          team(1, 1, [
            juror('a', { checkedIn: false }),
            juror('b'),
            juror('c'),
          ]),
          team(2, 1, [
            juror('d', { checkedIn: false }),
            juror('e'),
            juror('f'),
          ]),
        ],
        PRESENT,
      ),
      [sub('s1'), sub('s2')],
    );
    expect(groups.map((g) => g.sugeridos[0].id).sort()).toEqual(['s1', 's2']);
    expect(groups.every((g) => g.sugeridos[0].carga === 1)).toBe(true);
  });

  it('no sugiere a quien ya está en el grupo ni repite un suplente en el mismo grupo', () => {
    const [group] = suggestSubstitutes(
      groupsAtRisk([team(1, 1, [juror('s1', { checkedIn: false })])], PRESENT),
      [sub('s1'), sub('s2'), sub('s3', { teams: [{ id: 1, level: 1 }] })],
    );
    expect(group.sugeridos.map((s) => s.id)).toEqual(['s2']);
    expect(group.sinCubrir).toBe(2);
  });

  it('un suplente rechazado para el grupo no se vuelve a sugerir, pero queda en alternativas', () => {
    const [group] = suggestSubstitutes(
      groupsAtRisk(
        [
          team(1, 1, [
            juror('a', { checkedIn: false }),
            juror('b'),
            juror('c'),
          ]),
        ],
        PRESENT,
      ),
      [sub('s1'), sub('s2')],
      { rejectedPairs: [{ teamId: 1, substituteId: 's1' }] },
    );
    expect(group.sugeridos.map((s) => s.id)).toEqual(['s2']);
    expect(group.alternativas).toEqual([
      expect.objectContaining({ id: 's1', rechazado: true }),
    ]);
  });

  it('sin suplentes el faltante queda sin cubrir', () => {
    const [group] = suggestSubstitutes(
      groupsAtRisk([team(1, 1, [])], PRESENT),
      [],
    );
    expect(group).toMatchObject({
      sugeridos: [],
      alternativas: [],
      sinCubrir: 3,
    });
  });
});
