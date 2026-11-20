import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWalkInJurorDto } from './create-walk-in-juror.dto';

describe('CreateWalkInJurorDto (HU-24)', () => {
  const check = async (body: Record<string, unknown>) => {
    const instance = plainToInstance(CreateWalkInJurorDto, body);
    return { instance, errors: await validate(instance, { whitelist: true }) };
  };
  const valid = { firstName: 'Laura', lastName: 'Gómez', email: 'l@x.com' };

  it('descarta categoría y tipo: el administrador no puede cambiarlos', async () => {
    const { instance, errors } = await check({
      ...valid,
      jurorCategory: 'SENIOR',
      jurorType: 'OFFICIAL',
    });

    expect(errors).toEqual([]);
    expect(instance).not.toHaveProperty('jurorCategory');
    expect(instance).not.toHaveProperty('jurorType');
  });

  it('quita espacios sobrantes de nombre, apellido y correo', async () => {
    const { instance, errors } = await check({
      firstName: '  Laura   María ',
      lastName: ' Gómez  Ruiz',
      email: ' l@x.com ',
    });

    expect(errors).toEqual([]);
    expect(instance).toMatchObject({
      firstName: 'Laura María',
      lastName: 'Gómez Ruiz',
      email: 'l@x.com',
    });
  });

  it.each([
    ['nombre vacío', { ...valid, firstName: '   ' }],
    ['nombre con números', { ...valid, firstName: 'Laura2' }],
    ['sin apellido', { firstName: 'Laura', email: 'l@x.com' }],
    ['correo inválido', { ...valid, email: 'no-es-correo' }],
  ])('rechaza %s', async (_name, body) => {
    const { errors } = await check(body);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('solo true (o el texto "true") confirma los parecidos', async () => {
    const confirmed = await check({ ...valid, confirmSimilar: 'true' });
    const other = await check({ ...valid, confirmSimilar: 'si' });

    expect(confirmed.instance.confirmSimilar).toBe(true);
    expect(other.instance.confirmSimilar).toBe(false);
  });
});
