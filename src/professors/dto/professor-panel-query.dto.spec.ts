import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GradingReportQueryDto } from './professor-panel-query.dto';

// Mismas opciones que el ValidationPipe global (src/main.ts)
const parse = (plain: Record<string, unknown>) => {
  const dto = plainToInstance(GradingReportQueryDto, plain, {
    enableImplicitConversion: true,
  });
  return { dto, errors: validateSync(dto, { whitelist: true }) };
};

describe('GradingReportQueryDto', () => {
  it('sin parámetros usa los valores por defecto', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      sortBy: 'team',
      sortOrder: 'asc',
      final: false,
    });
    expect(dto.editionId).toBeUndefined();
    expect(dto.nrcId).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('final=%s ⇒ %s', (value, expected) => {
    expect(parse({ final: value }).dto.final).toBe(expected);
  });

  it('convierte ids y recorta la búsqueda', () => {
    const { dto, errors } = parse({
      editionId: '3',
      nrcId: '12',
      search: '  ana ',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ editionId: 3, nrcId: 12, search: 'ana' });
    expect(parse({ search: '   ' }).dto.search).toBeUndefined();
  });

  it('rechaza valores inválidos', () => {
    const props = (plain: Record<string, unknown>) =>
      parse(plain).errors.map((e) => e.property);
    expect(props({ sortBy: 'grade' })).toEqual(['sortBy']);
    expect(props({ sortOrder: 'up' })).toEqual(['sortOrder']);
    expect(props({ nrcId: 'abc' })).toEqual(['nrcId']);
    expect(props({ editionId: '0' })).toEqual(['editionId']);
  });
});
