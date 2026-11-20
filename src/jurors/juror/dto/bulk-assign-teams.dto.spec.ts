import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkAssignTeamsDto, MAX_BULK_TEAMS } from './bulk-assign-teams.dto';

async function check(plain: object) {
  const dto = plainToInstance(BulkAssignTeamsDto, plain);
  const errors = await validate(dto, { whitelist: true });
  return {
    dto,
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

describe('BulkAssignTeamsDto (HU-42)', () => {
  it('acepta un jurado y una lista de equipos; confirmWarnings es opcional', async () => {
    const { messages, dto } = await check({ jurorId: 'j1', teamIds: [1, 2] });
    expect(messages).toEqual([]);
    expect(dto.confirmWarnings).toBeFalsy();

    const confirmed = await check({
      jurorId: 'j1',
      teamIds: [1],
      confirmWarnings: true,
    });
    expect(confirmed.dto.confirmWarnings).toBe(true);
  });

  it('convierte ids de equipo en texto a número', async () => {
    const { messages, dto } = await check({
      jurorId: 'j1',
      teamIds: ['4', '5'],
    });
    expect(messages).toEqual([]);
    expect(dto.teamIds).toEqual([4, 5]);
  });

  it.each([
    [{ teamIds: [1] }, 'El ID del jurado es obligatorio'],
    [{ jurorId: 'j1' }, 'teamIds debe ser una lista'],
    [{ jurorId: 'j1', teamIds: [] }, 'Selecciona al menos un equipo'],
    [
      { jurorId: 'j1', teamIds: [1, 1] },
      'teamIds no puede tener equipos repetidos',
    ],
    [
      { jurorId: 'j1', teamIds: [1.5] },
      'Cada ID de equipo debe ser un número entero',
    ],
    [
      { jurorId: 'j1', teamIds: ['abc'] },
      'Cada ID de equipo debe ser un número entero',
    ],
    [{ jurorId: 'j1', teamIds: [0] }, 'Cada ID de equipo debe ser mayor a 0'],
    [{ jurorId: 'j1', teamIds: [-3] }, 'Cada ID de equipo debe ser mayor a 0'],
  ])('rechaza %j', async (plain, message) => {
    const { messages } = await check(plain);
    expect(messages).toContain(message);
  });

  it(`acepta hasta ${MAX_BULK_TEAMS} equipos y rechaza más`, async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(
      (await check({ jurorId: 'j1', teamIds: ids(MAX_BULK_TEAMS) })).messages,
    ).toEqual([]);
    expect(
      (await check({ jurorId: 'j1', teamIds: ids(MAX_BULK_TEAMS + 1) }))
        .messages,
    ).toContain(`Se pueden asignar máximo ${MAX_BULK_TEAMS} equipos a la vez`);
  });
});
