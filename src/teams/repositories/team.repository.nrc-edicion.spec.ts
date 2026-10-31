import { TeamRepository } from './team.repository';

/**
 * ARK-SP1 — un código de NRC puede existir en varias ferias. Al crear/editar un
 * integrante solo se vincula el NRC de la edición de su equipo.
 */
describe('TeamRepository — NRC por edición', () => {
  const tx = {
    member: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    nRC: { findMany: jest.fn() },
    team: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const repository = new TeamRepository({} as any, {} as any);
  const repo = repository as any;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.nRC.findMany.mockResolvedValue([{ id: 41, code: 9999 }]);
    tx.member.findUnique.mockResolvedValue(null);
    tx.member.create.mockResolvedValue({ id: 1 });
    tx.member.update.mockResolvedValue({ id: 1 });
    tx.team.findUnique.mockResolvedValue({ id: 10, editionId: 4 });
  });

  it('crear equipo con código repetido en dos ferias vincula solo el NRC de la edición activa', async () => {
    await repo.createMembers(tx, 10, 4, [
      {
        memberEmail: 'a@uninorte.edu.co',
        memberFirstName: 'A',
        memberLastName: 'B',
        studentCode: '1',
        nrc: ['9999'],
      },
    ]);

    expect(tx.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: [9999] }, editionId: 4, isActive: true },
      }),
    );
    expect(tx.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nrcs: { connect: [{ id: 41 }] },
        }),
      }),
    );
  });

  it('editar equipo no vincula NRC de otra edición', async () => {
    tx.member.findUnique
      .mockResolvedValueOnce({ id: 1, email: 'x@uninorte.edu.co' }) // dbMember
      .mockResolvedValueOnce(null); // existingEmail
    tx.user.findUnique.mockResolvedValue(null);

    await repo.updateMembers(tx, 10, [{ id: 1, nrc: ['9999'] }]);

    expect(tx.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: [9999] }, editionId: 4, isActive: true },
      }),
    );
  });
});
