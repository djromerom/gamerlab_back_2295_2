import { findTeamNotGradableBlocker } from './assignment-rules';

/** HU-39 (ARK-209): el presentador externo (equipo no calificable) no recibe jurados. */
describe('findTeamNotGradableBlocker', () => {
  it('bloquea al equipo no calificable con TEAM_NOT_GRADABLE', () => {
    expect(
      findTeamNotGradableBlocker({
        id: 7,
        teamCode: 'N2-XYZ-201',
        notGradable: true,
      }),
    ).toEqual({
      code: 'TEAM_NOT_GRADABLE',
      message: expect.stringContaining('N2-XYZ-201'),
      teamId: 7,
    });
  });

  it('deja pasar a un equipo calificable', () => {
    expect(
      findTeamNotGradableBlocker({
        id: 7,
        teamCode: 'N2-XYZ-201',
        notGradable: false,
      }),
    ).toBeNull();
  });
});
