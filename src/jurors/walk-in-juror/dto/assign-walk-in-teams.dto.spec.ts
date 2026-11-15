import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignWalkInTeamsDto } from './assign-walk-in-teams.dto';
import { TeamSuggestionQueryDto } from './team-suggestion-query.dto';

describe('DTOs de la asignación (HU-24)', () => {
  const check = async <T extends object>(
    cls: new () => T,
    body: Record<string, unknown>,
  ) => {
    const instance = plainToInstance(cls, body);
    return { instance, errors: await validate(instance) };
  };

  it('maxTeams llega como texto en la URL y se convierte; fuera de 1 a 10 es 400', async () => {
    const ok = await check(TeamSuggestionQueryDto, { maxTeams: '5' });
    expect(ok.errors).toEqual([]);
    expect(ok.instance.maxTeams).toBe(5);

    for (const maxTeams of ['0', '11', '2.5', 'abc']) {
      expect(
        (await check(TeamSuggestionQueryDto, { maxTeams })).errors.length,
      ).toBeGreaterThan(0);
    }
    expect((await check(TeamSuggestionQueryDto, {})).errors).toEqual([]);
  });

  it.each([
    ['lista vacía', { teamIds: [] }],
    ['repetidos', { teamIds: [1, 1] }],
    ['más de 10', { teamIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    ['ids no enteros', { teamIds: [1.5] }],
    ['sin teamIds', {}],
  ])('teamIds rechaza %s', async (_name, body) => {
    expect(
      (await check(AssignWalkInTeamsDto, body)).errors.length,
    ).toBeGreaterThan(0);
  });

  it('teamIds acepta de 1 a 10 grupos', async () => {
    expect(
      (await check(AssignWalkInTeamsDto, { teamIds: [3, 1, 2] })).errors,
    ).toEqual([]);
  });
});
