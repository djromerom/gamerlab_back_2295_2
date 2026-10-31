import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_PAGE_LIMIT, PaginationQueryDto } from './pagination-query.dto';

const toDto = (raw: Record<string, unknown>) =>
  plainToInstance(PaginationQueryDto, raw, { enableImplicitConversion: true });

describe('PaginationQueryDto — tope de limit (M9)', () => {
  it('el tope es 100', () => {
    expect(MAX_PAGE_LIMIT).toBe(100);
  });

  it('rechaza limit=100000', async () => {
    const errors = await validate(toDto({ limit: '100000' }));
    expect(errors.map((e) => e.property)).toContain('limit');
  });

  it('acepta limit=100 y el valor por defecto', async () => {
    expect(await validate(toDto({ limit: '100' }))).toHaveLength(0);
    expect(await validate(toDto({}))).toHaveLength(0);
  });
});
