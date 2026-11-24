import { TeamsService } from './teams.service';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';

describe('TeamsService.findAll / findPaged: isMine e isMember', () => {
  const repository = { findAll: jest.fn(), findPaged: jest.fn() };
  const prisma = {
    edition: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    member: { findFirst: jest.fn() },
  };
  const service = new TeamsService({} as any, repository as any, {} as any, prisma as any, {} as any, blobRefsPassthrough(), {} as any);
  const teams = () => [
    { id: 1, userId: 'lider-1', name: 'A', editionId: 5 },
    { id: 2, userId: 'lider-2', name: 'B', editionId: 5 },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findMany.mockResolvedValue([{ id: 5 }]);
    prisma.edition.findFirst.mockResolvedValue({ id: 5, title: 'Arkad 5', status: 'ACTIVE' });
    repository.findAll.mockResolvedValue(teams());
    repository.findPaged.mockResolvedValue({ data: teams(), metaData: { totalItems: 2 } });
    prisma.user.findUnique.mockResolvedValue({ email: 'lider@uninorte.edu.co' });
    prisma.member.findFirst.mockResolvedValue(null);
  });

  it('con sesión, isMine es true solo en el equipo del líder', async () => {
    const result: any[] = await service.findAll(false, false, 'lider-2');
    expect(result.map((t) => t.isMine)).toEqual([false, true]);
  });

  it('paginado: isMine solo en el equipo del líder y metaData intacta', async () => {
    const result: any = await service.findPaged(1, 10, false, false, 'lider-1');
    expect(result.data.map((t: any) => t.isMine)).toEqual([true, false]);
    expect(result.metaData).toEqual({ totalItems: 2 });
    expect(result.edition).toEqual({ id: 5, title: 'Arkad 5', status: 'ACTIVE', readOnly: false });
  });

  it('sin sesión no agrega isMine', async () => {
    const result: any[] = await service.findAll(false, false);
    expect(result.every((t) => !('isMine' in t))).toBe(true);
  });

  it('ARK-128: el equipo del mismo líder en una edición anterior no es "mi equipo"', async () => {
    repository.findAll.mockResolvedValue([
      { id: 9, userId: 'lider-1', name: 'Viejo', editionId: 4 },
      { id: 1, userId: 'lider-1', name: 'A', editionId: 5 },
    ]);
    const result: any[] = await service.findAll(false, false, 'lider-1');
    expect(result.map((t) => t.isMine)).toEqual([false, true]);
  });

  it('un administrador con sesión también recibe isMine', async () => {
    const result: any[] = await service.findAll(false, true, 'lider-1');
    expect(result.map((t) => t.isMine)).toEqual([true, false]);
  });

  it('el líder también es integrante: isMember true en su equipo', async () => {
    prisma.member.findFirst.mockResolvedValue({ teamId: 2 });
    const result: any[] = await service.findAll(false, false, 'lider-2');
    expect(result.map((t) => t.isMember)).toEqual([false, true]);
  });

  it('integrante no líder: isMember true en su equipo e isMine false en todos', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'Matias@Uninorte.edu.co' });
    prisma.member.findFirst.mockResolvedValue({ teamId: 1 });
    const result: any[] = await service.findAll(false, false, 'integrante-1');
    expect(result.map((t) => t.isMine)).toEqual([false, false]);
    expect(result.map((t) => t.isMember)).toEqual([true, false]);
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: {
        isActive: true,
        email: { equals: 'matias@uninorte.edu.co', mode: 'insensitive' },
        editionId: 5,
      },
      select: { teamId: true },
    });
  });

  it('integrante no líder en la lista paginada', async () => {
    prisma.member.findFirst.mockResolvedValue({ teamId: 2 });
    const result: any = await service.findPaged(1, 10, false, false, 'integrante-1');
    expect(result.data.map((t: any) => t.isMember)).toEqual([false, true]);
    expect(result.data.map((t: any) => t.isMine)).toEqual([false, false]);
  });

  it('estudiante sin equipo: isMember false en todos', async () => {
    const result: any[] = await service.findAll(false, false, 'sin-equipo');
    expect(result.map((t) => t.isMember)).toEqual([false, false]);
  });

  it('sin sesión no agrega isMember ni consulta integrantes', async () => {
    const result: any[] = await service.findAll(false, false);
    expect(result.every((t) => !('isMember' in t))).toBe(true);
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });
});
