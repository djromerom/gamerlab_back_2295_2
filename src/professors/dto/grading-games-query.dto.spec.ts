import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  GradingFilterOptionsQueryDto,
  GradingGamesQueryDto,
  resolvePanelSearch,
} from './grading-games-query.dto';

// Mismas opciones que el ValidationPipe global (src/main.ts)
const parse = (plain: Record<string, unknown>) => {
  const dto = plainToInstance(GradingGamesQueryDto, plain, {
    enableImplicitConversion: true,
  });
  return { dto, errors: validateSync(dto, { whitelist: true }) };
};

describe('GradingGamesQueryDto', () => {
  it('sin parámetros usa los valores por defecto del listado', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 1,
      limit: 25,
      sortBy: 'team',
      sortOrder: 'asc',
      includeHistorical: false,
    });
    expect(dto.search).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('includeHistorical=%s ⇒ %s', (value, expected) => {
    expect(parse({ includeHistorical: value }).dto.includeHistorical).toBe(
      expected,
    );
  });

  it('convierte página, límite e ids y recorta los textos', () => {
    const { dto, errors } = parse({
      page: '2',
      limit: '10',
      editionId: '3',
      nrcId: '12',
      search: '  ana ',
      team: ' dragones ',
      student: '   ',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 10,
      editionId: 3,
      nrcId: 12,
      search: 'ana',
      team: 'dragones',
    });
    expect(dto.student).toBeUndefined();
  });

  it('filtros inválidos ⇒ un error por parámetro, con su mensaje', () => {
    const errorsFor = (plain: Record<string, unknown>) =>
      parse(plain).errors.map((e) => ({
        property: e.property,
        messages: Object.values(e.constraints ?? {}),
      }));

    expect(errorsFor({ page: '0' })).toEqual([
      {
        property: 'page',
        messages: ['page debe ser un entero mayor o igual a 1.'],
      },
    ]);
    expect(errorsFor({ limit: 'abc' }).map((e) => e.property)).toEqual([
      'limit',
    ]);
    expect(errorsFor({ limit: 'abc' })[0].messages).toContain(
      'limit debe ser un entero mayor o igual a 1.',
    );
    expect(errorsFor({ nrcId: 'abc' }).map((e) => e.property)).toEqual([
      'nrcId',
    ]);
    expect(errorsFor({ editionId: '0' }).map((e) => e.property)).toEqual([
      'editionId',
    ]);
    expect(errorsFor({ sortBy: 'grade' })).toEqual([
      { property: 'sortBy', messages: ['sortBy debe ser team o student.'] },
    ]);
    expect(errorsFor({ sortOrder: 'up' })).toEqual([
      { property: 'sortOrder', messages: ['sortOrder debe ser asc o desc.'] },
    ]);
    expect(
      errorsFor({ page: '-1', sortBy: 'x' }).map((e) => e.property),
    ).toEqual(['page', 'sortBy']);
  });
});

describe('GradingGamesQueryDto limit', () => {
  it('acepta hasta 100 y rechaza más con mensaje propio', () => {
    expect(parse({ limit: '100' }).errors).toHaveLength(0);
    const errors = parse({ limit: '101' }).errors;
    expect(errors.map((e) => e.property)).toEqual(['limit']);
    expect(Object.values(errors[0].constraints ?? {})).toEqual([
      'limit debe ser como máximo 100.',
    ]);
  });
});

describe('GradingFilterOptionsQueryDto', () => {
  it('includeHistorical es false por defecto y acepta true', () => {
    const parseOptions = (plain: Record<string, unknown>) =>
      plainToInstance(GradingFilterOptionsQueryDto, plain, {
        enableImplicitConversion: true,
      });
    expect(parseOptions({}).includeHistorical).toBe(false);
    expect(parseOptions({ includeHistorical: 'true' }).includeHistorical).toBe(
      true,
    );
    expect(parseOptions({ includeHistorical: 'false' }).includeHistorical).toBe(
      false,
    );
  });
});

describe('resolvePanelSearch (alias deprecados team y student)', () => {
  it('usa search si viene', () => {
    expect(resolvePanelSearch({ search: 'ana' })).toBe('ana');
  });

  it('search gana sobre los alias', () => {
    expect(
      resolvePanelSearch({ search: 'ana', team: 'zeta', student: 'pedro' }),
    ).toBe('ana');
  });

  it('sin search usa team y luego student', () => {
    expect(resolvePanelSearch({ team: 'zeta' })).toBe('zeta');
    expect(resolvePanelSearch({ student: '200111' })).toBe('200111');
    expect(resolvePanelSearch({ team: 'zeta', student: 'pedro' })).toBe('zeta');
  });

  it('sin ninguno devuelve undefined', () => {
    expect(resolvePanelSearch({})).toBeUndefined();
  });
});
