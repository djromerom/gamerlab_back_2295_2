import { ValidationPipe } from '@nestjs/common';
import { TeamStatusQueryDto } from './team-status-query.dto';

// Mismas opciones que main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = (query: Record<string, string>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: TeamStatusQueryDto,
  }) as Promise<TeamStatusQueryDto>;

describe('TeamStatusQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['1', false],
    ['TRUE', false],
    ['', false],
  ])('includeLocks=%j -> %s', async (raw, expected) => {
    const dto = await parse({ teamIds: '1,2', includeLocks: raw });
    expect(dto.includeLocks).toBe(expected);
  });

  it('sin includeLocks queda en false y teamIds se parsea', async () => {
    const dto = await parse({ teamIds: '1,2' });
    expect(dto.includeLocks).toBeFalsy();
    expect(dto.teamIds).toEqual([1, 2]);
  });
});
