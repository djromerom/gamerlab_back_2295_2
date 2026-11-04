import { TeamRepository } from './team.repository';

/**
 * El consecutivo del código de equipo (N2-ISI-201, 202…) arranca en cada edición: el primer grupo
 * de la edición 5 es el 201 aunque la edición 4 ya haya llegado al 224. La BD solo exige que
 * (teamCode, editionId) sea único, así que el mismo código puede repetirse entre ediciones.
 */
describe('TeamRepository — código de equipo por edición', () => {
  /** Simula tx.team.findMany respetando el filtro editionId/startsWith como lo haría la BD. */
  const buildTx = (existing: { editionId: number; teamCode: string }[]) => ({
    team: {
      findMany: jest.fn(async ({ where }: any) =>
        existing
          .filter(
            (t) =>
              t.editionId === where.editionId &&
              t.teamCode.startsWith(where.teamCode.startsWith),
          )
          .map((t) => ({ teamCode: t.teamCode })),
      ),
    },
  });

  const repo = new TeamRepository({} as any, {} as any) as any;

  describe('getTeamNumber', () => {
    it('la primera inscripción de una edición nueva empieza en el base del semestre', async () => {
      const tx = buildTx([
        { editionId: 4, teamCode: 'N2-ISI-201' },
        { editionId: 4, teamCode: 'N2-ISI-224' },
      ]);
      await expect(repo.getTeamNumber(tx, 2, 5)).resolves.toBe('201');
    });

    it('consulta solo los equipos de la edición recibida', async () => {
      const tx = buildTx([]);
      await repo.getTeamNumber(tx, 2, 5);
      expect(tx.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            editionId: 5,
            teamCode: { startsWith: 'N2-' },
          }),
        }),
      );
    });

    it('continúa con el siguiente número libre dentro de la misma edición', async () => {
      const tx = buildTx([
        { editionId: 5, teamCode: 'N2-ISI-201' },
        { editionId: 5, teamCode: 'N2-MAT-202' },
        { editionId: 4, teamCode: 'N2-ISI-203' },
      ]);
      await expect(repo.getTeamNumber(tx, 2, 5)).resolves.toBe('203');
    });

    it('rellena el hueco más bajo de la edición si un equipo se eliminó', async () => {
      const tx = buildTx([
        { editionId: 5, teamCode: 'N2-ISI-201' },
        { editionId: 5, teamCode: 'N2-ISI-203' },
      ]);
      await expect(repo.getTeamNumber(tx, 2, 5)).resolves.toBe('202');
    });

    it('cada semestre tiene su propio rango dentro de la edición', async () => {
      const tx = buildTx([{ editionId: 5, teamCode: 'N2-ISI-201' }]);
      await expect(repo.getTeamNumber(tx, 3, 5)).resolves.toBe('301');
      await expect(repo.getTeamNumber(tx, 0, 5)).resolves.toBe('001');
    });

    it('una edición anterior conserva su numeración al seguir creciendo la actual', async () => {
      const tx = buildTx([
        { editionId: 4, teamCode: 'N3-IST-301' },
        { editionId: 4, teamCode: 'N3-IST-325' },
        { editionId: 5, teamCode: 'N3-IST-301' },
      ]);
      await expect(repo.getTeamNumber(tx, 3, 5)).resolves.toBe('302');
      await expect(repo.getTeamNumber(tx, 3, 4)).resolves.toBe('302');
    });
  });

  describe('createTeamRecord', () => {
    const dto = {
      teamName: 'Pixel',
      isExternal: false,
      members: [{ nrc: ['1234'] }],
    } as any;

    const build = (existing: { editionId: number; teamCode: string }[]) => {
      const tx: any = {
        ...buildTx(existing),
        verificationCode: undefined,
      };
      tx.team.findFirst = jest.fn().mockResolvedValue(null);
      tx.team.create = jest.fn(async ({ data }: any) => ({ id: 1, ...data }));
      const prisma = {
        subject: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ abrevName: 'ISI', semester: 2 }),
        },
      };
      const repository = new TeamRepository(prisma as any, {} as any) as any;
      // el código de verificación (HU-19) no es objeto de esta prueba
      jest
        .spyOn(
          require('../../team-verification/verification-code.util'),
          'generateUniqueVerificationCode',
        )
        .mockResolvedValue('ABC123');
      return { tx, repository };
    };

    afterEach(() => jest.restoreAllMocks());

    it('el primer equipo de la edición 5 recibe 201 aunque la edición 4 llegue al 225', async () => {
      const { tx, repository } = build([
        { editionId: 4, teamCode: 'N2-ISI-201' },
        { editionId: 4, teamCode: 'N2-ISI-225' },
      ]);
      const team = await repository.createTeamRecord(tx, dto, 'user-1', 5);
      expect(team.teamCode).toBe('N2-ISI-201');
      expect(team.editionId).toBe(5);
    });

    it('el segundo equipo de la misma edición recibe el siguiente número', async () => {
      const { tx, repository } = build([
        { editionId: 4, teamCode: 'N2-ISI-201' },
        { editionId: 5, teamCode: 'N2-ISI-201' },
      ]);
      const team = await repository.createTeamRecord(tx, dto, 'user-2', 5);
      expect(team.teamCode).toBe('N2-ISI-202');
    });
  });
});
