import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AuditLogQueryDto } from './audit-log-query.dto';

/** ARK-262 (BG-62): el historial se pide por páginas de 1 a 100 registros. */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const parse = (query: object) =>
  pipe.transform(query, {
    type: 'query',
    metatype: AuditLogQueryDto,
  }) as Promise<AuditLogQueryDto>;

describe('AuditLogQueryDto (ARK-262)', () => {
  it('por defecto página 1 de 20', async () => {
    const dto = await parse({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it.each(['1', '50', '100'])('acepta limit=%s', async (limit) => {
    const dto = await parse({ limit });
    expect(dto.limit).toBe(Number(limit));
  });

  it.each(['0', '101', '1000', '-5', 'abc'])(
    'rechaza limit=%s con 400',
    async (limit) => {
      await expect(parse({ limit })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('el mensaje dice cuál es el máximo', async () => {
    const error: unknown = await parse({ limit: '101' }).catch(
      (e: unknown) => e,
    );
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain('limit no puede ser mayor a 100');
  });
});
