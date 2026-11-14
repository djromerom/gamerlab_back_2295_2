import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EnrollJurorDto } from './enroll-juror.dto';
import { ListEditionJurorsQueryDto } from './list-edition-jurors-query.dto';
import { UpdateJurorEditionStatusDto } from './update-juror-edition-status.dto';

async function errorsOf<T extends object>(
  cls: new () => T,
  plain: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain), {
    whitelist: true,
  });
  const flat: string[] = [];
  const walk = (list: typeof errors) =>
    list.forEach((e) => {
      flat.push(...Object.values(e.constraints ?? {}));
      walk(e.children ?? []);
    });
  walk(errors);
  return flat;
}

describe('DTOs de jurados por edición (HU-25)', () => {
  describe('UpdateJurorEditionStatusDto', () => {
    it('acepta un lote válido', async () => {
      expect(
        await errorsOf(UpdateJurorEditionStatusDto, {
          declineRemaining: true,
          items: [
            { jurorId: 'a', status: 'CONFIRMED', type: 'BACKUP' },
            { jurorId: 'b', status: 'DECLINED' },
          ],
        }),
      ).toEqual([]);
    });

    it('rechaza lista vacía, jurorId repetido, estado y tipo inválidos', async () => {
      expect(
        await errorsOf(UpdateJurorEditionStatusDto, { items: [] }),
      ).toContain('items no puede estar vacío');

      expect(
        await errorsOf(UpdateJurorEditionStatusDto, {
          items: [
            { jurorId: 'a', status: 'CONFIRMED' },
            { jurorId: 'a', status: 'DECLINED' },
          ],
        }),
      ).toContain('items no puede repetir un jurorId');

      const invalid = await errorsOf(UpdateJurorEditionStatusDto, {
        items: [{ jurorId: 'a', status: 'AUTOMATIC', type: 'SENIOR' }],
      });
      expect(invalid).toContain(
        'status debe ser PENDING, CONFIRMED o DECLINED',
      );
      expect(invalid).toContain('type debe ser OFFICIAL o BACKUP');
    });

    it('rechaza más de 500 filas', async () => {
      const items = Array.from({ length: 501 }, (_, i) => ({
        jurorId: `j${i}`,
        status: 'CONFIRMED',
      }));
      expect(await errorsOf(UpdateJurorEditionStatusDto, { items })).toContain(
        'items admite como máximo 500 filas',
      );
    });
  });

  describe('ListEditionJurorsQueryDto', () => {
    it('convierte los números del query y usa 20 por página', () => {
      const dto = plainToInstance(ListEditionJurorsQueryDto, {
        editionId: '5',
        page: '2',
      });
      expect(dto).toMatchObject({ editionId: 5, page: 2, limit: 20 });
    });

    it('rechaza búsqueda corta, límite mayor a 100 y estado desconocido', async () => {
      const errors = await errorsOf(ListEditionJurorsQueryDto, {
        search: ' a ',
        limit: '101',
        status: 'OTHER',
      });
      expect(errors).toContain('La búsqueda debe tener al menos 2 caracteres');
      expect(errors).toContain('limit no puede superar 100');
      expect(errors.some((e) => e.startsWith('status debe ser'))).toBe(true);
    });
  });

  describe('EnrollJurorDto', () => {
    it('normaliza el correo', () => {
      const dto = plainToInstance(EnrollJurorDto, {
        email: '  Ana.Perez@Empresa.com ',
      });
      expect(dto.email).toBe('ana.perez@empresa.com');
    });

    it('rechaza un correo inválido', async () => {
      expect(
        await errorsOf(EnrollJurorDto, { email: 'no-es-correo' }),
      ).toContain('El correo electrónico no es válido');
    });
  });
});
