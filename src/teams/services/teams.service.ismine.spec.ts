import { TeamsService } from './teams.service';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';

describe('TeamsService.findAll / findPaged: isMine', () => {
  const repository = { findAll: jest.fn(), findPaged: jest.fn() };
  const prisma = { edition: { findMany: jest.fn() } };
  const service = new TeamsService({} as any, repository as any, {} as any, prisma as any, {} as any, blobRefsPassthrough(), {} as any);
  const teams = () => [
    { id: 1, userId: 'lider-1', name: 'A', editionId: 5 },
    { id: 2, userId: 'lider-2', name: 'B', editionId: 5 },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findMany.mockResolvedValue([{ id: 5 }]);
    repository.findAll.mockResolvedValue(teams());
    repository.findPaged.mockResolvedValue({ data: teams(), metaData: { totalItems: 2 } });
  });

  it('con sesión, isMine es true solo en el equipo del líder', async () => {
    const result: any[] = await service.findAll(false, false, 'lider-2');
    expect(result.map((t) => t.isMine)).toEqual([false, true]);
  });

  it('paginado: isMine solo en el equipo del líder y metaData intacta', async () => {
    const result: any = await service.findPaged(1, 10, false, false, 'lider-1');
    expect(result.data.map((t: any) => t.isMine)).toEqual([true, false]);
    expect(result.metaData).toEqual({ totalItems: 2 });
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
});
