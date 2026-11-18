import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateExternalPresenterDto } from './dto/external-presenter.dto';

/**
 * ARK-257 (BG-57): el nombre y el apellido de un presentador externo aceptan números («QA
 * Presentador 2»), con el mismo ValidationPipe de main.ts.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const body = (extra: object = {}) => ({
  email: 'ana@empresa.test',
  confirmEmail: 'ana@empresa.test',
  firstName: 'Ana',
  lastName: 'Pérez',
  ...extra,
});
const parse = (value: object) =>
  pipe.transform(value, {
    type: 'body',
    metatype: CreateExternalPresenterDto,
  }) as Promise<CreateExternalPresenterDto>;

describe('nombre del presentador externo (ARK-257)', () => {
  it.each([
    ['QA', 'Presentador 2'],
    ['Studio 54', "O'Brien-Núñez 3"],
    ['Ana', 'Pérez'],
  ])('acepta «%s» y «%s»', async (firstName, lastName) => {
    const dto = await parse(body({ firstName, lastName }));
    expect(dto.firstName).toBe(firstName);
    expect(dto.lastName).toBe(lastName);
  });

  it.each(['Ana <b>', 'Ana@2', 'Ana_2', 'Ana; DROP', 'Ana.2', '<script>1'])(
    'sigue rechazando símbolos: «%s»',
    async (firstName) => {
      await expect(parse(body({ firstName }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('el mensaje dice que se aceptan números', async () => {
    const error: unknown = await parse(body({ lastName: 'Pérez!' })).catch(
      (e: unknown) => e,
    );
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain('letras, números y espacios');
  });
});
