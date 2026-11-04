import { NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamRepository } from '../repositories/team.repository';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';

/** ARK-129 (HU-26): GET /teams devuelve solo la edición pedida o, por defecto, la activa. */
describe('TeamsService.findAll / findPaged: edición', () => {
  const repository = { findAll: jest.fn(), findPaged: jest.fn() };
  const prisma = { edition: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() } };
  const service = new TeamsService({} as any, repository as any, {} as any, prisma as any, {} as any, blobRefsPassthrough(), {} as any);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue({ id: 5, title: 'E5', status: 'ACTIVE' });
    prisma.edition.findMany.mockResolvedValue([{ id: 5 }]);
    repository.findAll.mockResolvedValue([]);
    repository.findPaged.mockResolvedValue({ data: [], metaData: { totalItems: 0 } });
  });

  it('sin editionId pide al repositorio solo la edición activa', async () => {
    await service.findAll(false);
    expect(repository.findAll).toHaveBeenCalledWith(false, 5);
    await service.findPaged(1, 10, true);
    expect(repository.findPaged).toHaveBeenCalledWith(1, 10, true, 5);
  });

  it('con editionId usa esa edición y la marca de solo lectura si no es la activa', async () => {
    prisma.edition.findUnique.mockResolvedValue({ id: 4, title: 'E4', status: 'INACTIVE', endsAt: new Date() });
    const result: any = await service.findPaged(1, 10, false, true, undefined, 4);
    expect(repository.findPaged).toHaveBeenCalledWith(1, 10, false, 4);
    expect(result.edition).toEqual({ id: 4, title: 'E4', status: 'INACTIVE', readOnly: true });
  });

  it('sin edición activa la lista sale vacía y no consulta equipos', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(service.findAll(false)).resolves.toEqual([]);
    const paged: any = await service.findPaged(2, 10, false);
    expect(paged).toMatchObject({ data: [], edition: null, metaData: { totalItems: 0, currentPage: 2 } });
    expect(repository.findAll).not.toHaveBeenCalled();
    expect(repository.findPaged).not.toHaveBeenCalled();
  });

  it('una edición que no existe responde 404', async () => {
    prisma.edition.findUnique.mockResolvedValue(null);
    await expect(service.findAll(false, true, undefined, 99)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TeamRepository.findAll / findPaged: filtro por edición', () => {
  const prisma = {
    team: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  const repo = new TeamRepository(prisma as any, {} as any);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.team.findMany.mockResolvedValue([]);
    prisma.team.count.mockResolvedValue(0);
    prisma.$transaction.mockResolvedValue([[], 0]);
  });

  it('findAll filtra por editionId', async () => {
    await repo.findAll(false, 4);
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { editionId: 4 } }));
  });

  it('findPaged filtra la página y el total por la misma edición', async () => {
    await repo.findPaged(1, 10, false, 4);
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { editionId: 4 } }));
    expect(prisma.team.count).toHaveBeenCalledWith({ where: { editionId: 4 } });
  });
});
