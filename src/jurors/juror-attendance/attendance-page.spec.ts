import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { buildAttendancePage } from './attendance-page';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { AttendanceRow } from './juror-attendance.types';

const row = (
  id: string,
  firstName: string,
  lastName: string,
  checkedInAt: string | null = null,
): AttendanceRow => ({
  firstName,
  lastName,
  item: {
    jurorId: id,
    name: `${firstName} ${lastName}`,
    category: 'Junior',
    isProfessor: false,
    hasBadge: true,
    status: checkedInAt ? 'PRESENT' : 'MISSING',
    checkedInAt: checkedInAt ? new Date(checkedInAt) : null,
    method: checkedInAt ? 'QR' : null,
    checkedInBy: checkedInAt ? { id: 's', name: 'Staff' } : null,
  },
});

const rows = [
  row('p-early', 'Ana', 'Zapata', '2026-11-26T13:00:00Z'),
  row('m-b', 'José', 'Martínez'),
  row('p-late', 'Carlos', 'Álvarez', '2026-11-26T13:30:00Z'),
  row('m-a', 'María', 'Ávila'),
];

const ids = (page: ReturnType<typeof buildAttendancePage>) =>
  page.data.map((i) => i.jurorId);

describe('buildAttendancePage (HU-29)', () => {
  it('faltantes primero por apellido; luego presentes, el último en llegar arriba', () => {
    expect(ids(buildAttendancePage(rows, {}))).toEqual([
      'm-a',
      'm-b',
      'p-late',
      'p-early',
    ]);
  });

  it('totales sobre la búsqueda, sin importar el filtro de estado', () => {
    const page = buildAttendancePage(rows, { status: 'MISSING' });
    expect(ids(page)).toEqual(['m-a', 'm-b']);
    expect(page.totals).toEqual({ present: 2, missing: 2, total: 4 });
    expect(page.metadata.totalItems).toBe(2);
  });

  it('la búsqueda no distingue tildes ni mayúsculas y exige todas las palabras', () => {
    expect(ids(buildAttendancePage(rows, { search: 'JOSE martinez' }))).toEqual(
      ['m-b'],
    );
    expect(ids(buildAttendancePage(rows, { search: 'jose zapata' }))).toEqual(
      [],
    );
    const page = buildAttendancePage(rows, { search: 'avila' });
    expect(ids(page)).toEqual(['m-a']);
    expect(page.totals).toEqual({ present: 0, missing: 1, total: 1 });
  });

  it('pagina y llena metadata', () => {
    const page = buildAttendancePage(rows, { page: 2, limit: 3 });
    expect(ids(page)).toEqual(['p-early']);
    expect(page.metadata).toEqual({
      totalItems: 4,
      itemsOnCurrentPage: 1,
      currentPage: 2,
      itemsPerPage: 3,
      totalPages: 2,
    });
  });

  it('sin jurados devuelve todo en cero', () => {
    const page = buildAttendancePage([], {});
    expect(page.data).toEqual([]);
    expect(page.totals).toEqual({ present: 0, missing: 0, total: 0 });
    expect(page.metadata.totalPages).toBe(0);
  });
});

describe('ListAttendanceQueryDto', () => {
  const check = (raw: Record<string, unknown>) =>
    validate(
      plainToInstance(ListAttendanceQueryDto, raw, {
        enableImplicitConversion: true,
      }),
    );
  const props = async (raw: Record<string, unknown>) =>
    (await check(raw)).map((e) => e.property);

  it('acepta la consulta vacía y los dos estados', async () => {
    expect(await check({})).toHaveLength(0);
    expect(await check({ status: 'PRESENT' })).toHaveLength(0);
    expect(await check({ status: 'MISSING' })).toHaveLength(0);
  });

  it('rechaza un estado que no existe', async () => {
    expect(await props({ status: 'LATE' })).toContain('status');
  });

  it('rechaza limit mayor que el tope y page 0', async () => {
    expect(await props({ limit: '101' })).toContain('limit');
    expect(await props({ page: '0' })).toContain('page');
  });

  it('rechaza una búsqueda de 1 carácter y trata "  " como no enviada', async () => {
    expect(await props({ search: 'a' })).toContain('search');
    expect(await check({ search: '   ' })).toHaveLength(0);
  });
});
