import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEditionDto } from './create-edition.dto';
import { UpdateEditionDto } from './update-edition.dto';

const base = { year: 2026, semester: 10, title: 'T' };

describe('Edición — orden de fechas en el DTO (M7)', () => {
  it('crear con endsAt anterior a startsAt falla en endsAt', async () => {
    const dto = plainToInstance(CreateEditionDto, { ...base, startsAt: '2026-06-01', endsAt: '2026-01-01' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['endsAt']);
  });

  it('crear con fechas en orden es válido', async () => {
    const dto = plainToInstance(CreateEditionDto, { ...base, startsAt: '2026-01-01', endsAt: '2026-06-01' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('editar con ambas fechas invertidas falla; con una sola no falla en el DTO', async () => {
    const bad = plainToInstance(UpdateEditionDto, { startsAt: '2026-06-01', endsAt: '2026-01-01' });
    expect((await validate(bad)).map((e) => e.property)).toEqual(['endsAt']);
    const partial = plainToInstance(UpdateEditionDto, { endsAt: '2026-01-01' });
    expect(await validate(partial)).toHaveLength(0);
  });
});
