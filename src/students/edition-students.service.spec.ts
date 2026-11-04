import { EditionStudentsService } from './edition-students.service';

/** ARK-129 (HU-26): la consulta y el armado de la lista (la BD real está en el .db.spec). */
describe('EditionStudentsService.list', () => {
  const prisma = {
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    member: { findMany: jest.fn(), count: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new EditionStudentsService(prisma as any);

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 10,
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'Ana@uninorte.edu.co',
    studentCode: '200',
    isActive: true,
    team: {
      id: 3,
      teamName: 'Pixel',
      teamCode: 'N1-X-1',
      isActive: true,
      userId: 'u-ana',
      videogame: { videogameStatus: { status: 'CONFIRMADO' } },
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue({ id: 5, title: 'E5', status: 'ACTIVE' });
    prisma.member.findMany.mockResolvedValue([]);
    prisma.member.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
  });

  it('sin editionId lista la edición activa', async () => {
    await service.list({ page: 1, limit: 20 });
    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ editionId: 5 }] }, skip: 0, take: 20 }),
    );
  });

  it('sin edición activa devuelve una lista vacía sin consultar integrantes', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.edition).toBeNull();
    expect(result.data).toEqual([]);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('combina la búsqueda (escapando % y _) y el estado del videojuego', async () => {
    await service.list({ page: 2, limit: 10, search: '50%_a', videogameStatus: 'RECHAZADO' });
    const where = prisma.member.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ editionId: 5 });
    expect(where.AND[1]).toEqual({ team: { videogame: { videogameStatus: { status: 'RECHAZADO' } } } });
    expect(where.AND[2].OR[0]).toEqual({ firstName: { contains: '50\\%\\_a', mode: 'insensitive' } });
    expect(prisma.member.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
  });

  it('el líder lleva el estado de su cuenta; un integrante sin cuenta, null', async () => {
    prisma.member.findMany.mockResolvedValue([
      row(),
      row({ id: 11, email: 'beto@uninorte.edu.co', firstName: 'Beto' }),
    ]);
    prisma.member.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-ana', email: 'ana@uninorte.edu.co', confirmationStatus: { status: 'PENDIENTE' } },
    ]);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data[0]).toMatchObject({ isLeader: true, accountStatus: 'PENDIENTE', videogameStatus: 'CONFIRMADO' });
    expect(result.data[1]).toMatchObject({ isLeader: false, accountStatus: null });
    expect(result.metadata).toEqual({ totalItems: 2, itemsOnCurrentPage: 2, currentPage: 1, itemsPerPage: 20, totalPages: 1 });
  });

  it('quien tiene cuenta por liderar otro equipo no es líder de este', async () => {
    prisma.member.findMany.mockResolvedValue([row({ team: { ...row().team, userId: 'otro-lider' } })]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-ana', email: 'ana@uninorte.edu.co', confirmationStatus: { status: 'CONFIRMADO' } },
    ]);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data[0]).toMatchObject({ isLeader: false, accountStatus: 'CONFIRMADO' });
  });

  it('un equipo sin videojuego sale con videogameStatus null', async () => {
    prisma.member.findMany.mockResolvedValue([row({ team: { ...row().team, videogame: null } })]);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data[0].videogameStatus).toBeNull();
  });
});
