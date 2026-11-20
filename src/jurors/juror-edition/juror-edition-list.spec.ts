import { buildPage, normalizeText } from './juror-edition-list';
import { EditionJurorItem } from './juror-edition.types';

const item = (
  jurorId: string,
  lastName: string,
  status: EditionJurorItem['status'],
  extra: Partial<EditionJurorItem> = {},
): EditionJurorItem => ({
  jurorId,
  firstName: 'Ana',
  lastName,
  email: `${jurorId}@x.com`,
  category: 'Junior',
  type: status === 'AUTOMATIC' ? null : 'OFFICIAL',
  status,
  source: status === 'AUTOMATIC' ? 'PROFESSOR_NRC' : 'ENROLLED',
  walkIn: false,
  updatedAt: null,
  ...extra,
});

const items = [
  item('p1', 'Zapata', 'AUTOMATIC'),
  item('c1', 'Álvarez', 'CONFIRMED'),
  item('d1', 'Bolívar', 'DECLINED'),
  item('n2', 'Mora', 'PENDING'),
  item('n1', 'Gómez', 'PENDING', { type: 'BACKUP' }),
];

describe('buildPage (HU-25)', () => {
  it('ordena Pendientes primero y luego por apellido, y cuenta por estado', () => {
    const page = buildPage(items, { page: 1, limit: 20 });

    expect(page.data.map((i) => i.jurorId)).toEqual([
      'n1',
      'n2',
      'c1',
      'd1',
      'p1',
    ]);
    expect(page.counts).toEqual({
      PENDING: 2,
      CONFIRMED: 1,
      DECLINED: 1,
      AUTOMATIC: 1,
    });
    expect(page.metadata).toEqual({
      totalItems: 5,
      itemsOnCurrentPage: 5,
      currentPage: 1,
      itemsPerPage: 20,
      totalPages: 1,
    });
  });

  it('el filtro de estado no cambia los contadores de las pestañas', () => {
    const page = buildPage(items, { status: 'PENDING', page: 1, limit: 20 });

    expect(page.data.map((i) => i.jurorId)).toEqual(['n1', 'n2']);
    expect(page.metadata.totalItems).toBe(2);
    expect(page.counts.CONFIRMED).toBe(1);
  });

  it('la búsqueda ignora tildes y mayúsculas, exige cada palabra y sí afecta los contadores', () => {
    const page = buildPage(items, {
      search: 'ALVAREZ ana',
      page: 1,
      limit: 20,
    });

    expect(page.data.map((i) => i.jurorId)).toEqual(['c1']);
    expect(page.counts).toEqual({
      PENDING: 0,
      CONFIRMED: 1,
      DECLINED: 0,
      AUTOMATIC: 0,
    });
  });

  it('busca también por correo', () => {
    const page = buildPage(items, { search: 'd1@x', page: 1, limit: 20 });
    expect(page.data.map((i) => i.jurorId)).toEqual(['d1']);
  });

  it('filtra por tipo (los profesores automáticos no tienen tipo)', () => {
    const page = buildPage(items, { type: 'OFFICIAL', page: 1, limit: 20 });
    expect(page.data.map((i) => i.jurorId)).toEqual(['n2', 'c1', 'd1']);
  });

  it('pagina y devuelve una página vacía fuera de rango', () => {
    const second = buildPage(items, { page: 2, limit: 2 });
    expect(second.data.map((i) => i.jurorId)).toEqual(['c1', 'd1']);
    expect(second.metadata.totalPages).toBe(3);

    const beyond = buildPage(items, { page: 9, limit: 2 });
    expect(beyond.data).toEqual([]);
    expect(beyond.metadata.itemsOnCurrentPage).toBe(0);
  });

  it('lista vacía', () => {
    const page = buildPage([], { page: 1, limit: 20 });
    expect(page.data).toEqual([]);
    expect(page.metadata.totalPages).toBe(0);
  });

  it('normalizeText quita tildes', () => {
    expect(normalizeText('José ÑÚÑEZ')).toBe('jose nunez');
  });
});
