import { TeamsService } from './teams.service';
import { BlobReferenceService } from '../../upload/blob-reference.service';
import { ROLE_IDS } from '../../auth/constants/roles';

/** Task 28 — la BD guarda la referencia del blob y la respuesta pública firma al leer. */
describe('TeamsService — referencia de blob (Task 28)', () => {
  const repository = {
    findAll: jest.fn(),
    findPaged: jest.fn(),
    findOne: jest.fn(),
    updateTeamInfo: jest.fn(),
    update: jest.fn(),
    createTeam: jest.fn(),
  };
  const azure = { signReadUrlById: jest.fn(), containerUrls: ['https://acct.blob.core.windows.net/files'] };
  const prisma = { upload: { findFirst: jest.fn() } };
  let service: TeamsService;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.AZURE_CONTAINER = 'files';
    azure.signReadUrlById.mockImplementation(async (id: string, ttl: number) => ({
      url: `https://blob.test/files/${id}.png?sig=s&ttl=${ttl}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    }));
    const blobRefs = new BlobReferenceService(azure as any, prisma as any);
    service = new TeamsService({} as any, repository as any, {} as any, { videogame: { findUnique: jest.fn().mockResolvedValue(null) } } as any, { isRankingVisible: jest.fn().mockResolvedValue(true) } as any, blobRefs);
  });

  const teamWith = (videogame: any) => ({ id: 1, teamName: 'T', videogame, members: [] });

  it('GET /teams entrega una URL firmada de 1 hora para un videojuego con referencia', async () => {
    repository.findAll.mockResolvedValue([
      teamWith({ id: 7, logoUrl: 'upload:logo-1', gameFileUrl: 'upload:zip-1', name: 'G' }),
    ]);
    const [team]: any = await service.findAll(false, true);
    expect(azure.signReadUrlById).toHaveBeenCalledWith('logo-1', 3600);
    expect(team.videogame.logoUrl).toBe('https://blob.test/files/logo-1.png?sig=s&ttl=3600');
    expect(team.videogame.gameFileUrl).toBe('https://blob.test/files/zip-1.png?sig=s&ttl=3600');
  });

  it('GET /teams paginado también firma al leer', async () => {
    repository.findPaged.mockResolvedValue({
      data: [teamWith({ id: 7, logoUrl: 'upload:logo-1', gameFileUrl: null })],
      metaData: { totalItems: 1 },
    });
    const res: any = await service.findPaged(1, 10, false, true);
    expect(res.data[0].videogame.logoUrl).toContain('logo-1');
    expect(res.data[0].videogame.gameFileUrl).toBeNull();
    expect(res.metaData.totalItems).toBe(1);
  });

  it('un registro viejo con URL completa se devuelve sin cambios', async () => {
    const legacy = 'https://acct.blob.core.windows.net/files/1-a.png?sig=viejo';
    repository.findAll.mockResolvedValue([teamWith({ id: 7, logoUrl: legacy, gameFileUrl: legacy })]);
    const [team]: any = await service.findAll(false, true);
    expect(team.videogame.logoUrl).toBe(legacy);
    expect(team.videogame.gameFileUrl).toBe(legacy);
    expect(azure.signReadUrlById).not.toHaveBeenCalled();
  });

  it('PATCH del videojuego guarda la referencia, no la URL firmada', async () => {
    repository.findOne.mockResolvedValue({ id: 1, userId: 'u1' });
    prisma.upload.findFirst.mockResolvedValue({ id: 'logo-9', isPublic: true, createdAt: new Date() });
    const dto: any = {
      videogame: {
        logoUrl: 'https://acct.blob.core.windows.net/files/1699-logo.png?sv=1&sig=zzz',
        description: 'x',
      },
    };
    await service.updateTeamInfo(1, dto, { id: 'u1', roleId: ROLE_IDS.STUDENT } as any);
    const sent = repository.updateTeamInfo.mock.calls[0][1];
    expect(sent.videogame.logoUrl).toBe('upload:logo-9');
    expect(sent.videogame.description).toBe('x');
    expect(dto.videogame.logoUrl).toContain('sig=zzz'); // no muta el DTO recibido
  });

  it('el PATCH completo (members/isExternal) también guarda la referencia', async () => {
    repository.findOne.mockResolvedValue({ id: 1, userId: 'u1' });
    prisma.upload.findFirst.mockResolvedValue({ id: 'zip-3', isPublic: true, createdAt: new Date() });
    const dto: any = {
      isExternal: false,
      videogame: { gameFileUrl: 'https://acct.blob.core.windows.net/files/2-g.zip?sig=q' },
    };
    await service.update(1, dto, { id: 'u1', roleId: ROLE_IDS.ADMIN } as any);
    expect(repository.update.mock.calls[0][1].videogame.gameFileUrl).toBe('upload:zip-3');
  });
});
