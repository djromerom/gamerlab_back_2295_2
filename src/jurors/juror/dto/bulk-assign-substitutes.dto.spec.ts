import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BulkAssignSubstitutesDto,
  MAX_COVERED_JURORS,
  MAX_SUBSTITUTES,
} from './bulk-assign-substitutes.dto';

async function check(plain: object) {
  const dto = plainToInstance(BulkAssignSubstitutesDto, plain);
  const errors = await validate(dto, { whitelist: true });
  return {
    dto,
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

describe('BulkAssignSubstitutesDto (HU-09)', () => {
  it('acepta listas válidas; confirmWarnings es opcional', async () => {
    const { messages, dto } = await check({
      jurorIds: ['j1', 'j2'],
      substituteIds: ['s1'],
    });
    expect(messages).toEqual([]);
    expect(dto.confirmWarnings).toBeFalsy();

    const confirmed = await check({
      jurorIds: ['j1'],
      substituteIds: ['s1'],
      confirmWarnings: true,
    });
    expect(confirmed.dto.confirmWarnings).toBe(true);
  });

  it.each([
    [{ substituteIds: ['s1'] }, 'jurorIds debe ser una lista'],
    [
      { jurorIds: [], substituteIds: ['s1'] },
      'Selecciona al menos un jurado a cubrir',
    ],
    [
      { jurorIds: ['j1'], substituteIds: [] },
      'Selecciona al menos un suplente',
    ],
    [
      { jurorIds: ['j1', 'j1'], substituteIds: ['s1'] },
      'jurorIds no puede tener jurados repetidos',
    ],
    [
      { jurorIds: ['j1'], substituteIds: ['s1', 's1'] },
      'substituteIds no puede tener suplentes repetidos',
    ],
    [
      { jurorIds: [''], substituteIds: ['s1'] },
      'Los ids de jurado no pueden estar vacíos',
    ],
    [
      { jurorIds: [7], substituteIds: ['s1'] },
      'Cada id de jurado debe ser texto',
    ],
    [
      { jurorIds: ids('j', MAX_COVERED_JURORS + 1), substituteIds: ['s1'] },
      `Se pueden cubrir máximo ${MAX_COVERED_JURORS} jurados a la vez`,
    ],
    [
      { jurorIds: ['j1'], substituteIds: ids('s', MAX_SUBSTITUTES + 1) },
      `Se pueden asignar máximo ${MAX_SUBSTITUTES} suplentes a la vez`,
    ],
  ])('rechaza %j', async (plain, message) => {
    expect((await check(plain)).messages).toContain(message);
  });
});
