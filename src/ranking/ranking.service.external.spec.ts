import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { buildTieKey } from './ranking.logic';
import {
  EDITION,
  PA,
  PB,
  makePrisma,
  scoreRow,
  team,
} from './ranking.prisma.mock';
import { RankingService } from './ranking.service';

/** HU-38 (ARK-219): el grupo «Externos» en el servicio del ranking (Prisma en memoria). */
const admin = { id: 'admin', roleId: ROLE_IDS.ADMIN } as any;
const asProf = (p: { id: string }) =>
  ({ id: p.id, roleId: ROLE_IDS.PROFESSOR }) as any;
const sameProfKey = buildTieKey(EDITION, 1, 4.5, [1, 2]);

describe('RankingService (HU-38)', () => {
  let prisma: any;
  let state: ReturnType<typeof makePrisma>['state'];
  let service: RankingService;

  beforeEach(() => {
    ({ prisma, state } = makePrisma());
    service = new RankingService(prisma, blobRefsPassthrough());
  });

  describe('grupo Externos (HU-38, ARK-219)', () => {
    // 6 (N1) y 7 (N2) son externos y empatan en 4.8; los dos de PA → decide PA
    const externalKey = buildTieKey(EDITION, null, 4.8, [6, 7]);

    beforeEach(() => {
      state.rows.push(
        { ...scoreRow(6, 'N1-X-6', 4.8), isExternal: true },
        { ...scoreRow(7, 'N2-X-7', 4.8), isExternal: true },
        { ...scoreRow(8, 'N0-C-8', 4.9), isExternal: true },
      );
      state.teams.push(team(6, 4, [PA]), team(7, 6, [PA]), team(8, 7, [PB]));
    });

    it('los externos salen de su nivel y forman su propio grupo; el N0 externo sigue en N0', async () => {
      const r = await service.getRanking({});
      const n1 = r.levels.find((l) => l.level === 1)!;
      expect(n1.teams.map((t) => t.teamId).sort()).toEqual([1, 2]);
      expect(r.levels.find((l) => l.level === 0)?.teams[0].teamId).toBe(8);
      expect(r.external).toMatchObject({
        level: null,
        external: true,
        label: 'Externos',
      });
      expect(r.external!.teams.map((t) => t.teamId).sort()).toEqual([6, 7]);
      expect(r.external!.ties[0]).toMatchObject({
        tieKey: externalKey,
        status: 'PENDING',
      });
      expect(r.pendingTies).toBe(2); // el de N1 (PA) y el de Externos
    });

    it('con un nivel pedido no se devuelve el grupo Externos', async () => {
      expect((await service.getRanking({ level: 1 })).external).toBeNull();
    });

    it('winners trae el podio de Externos aparte', async () => {
      const w = await service.getWinners({});
      expect(w.external).toMatchObject({
        external: true,
        label: 'Externos',
        pendingTies: 1,
      });
      expect(w.external!.podium).toHaveLength(2);
      expect(
        w.levels.every(
          (l) => !l.podium.some((t) => t.isExternal && l.level !== 0),
        ),
      ).toBe(true);
    });

    it('el profesor decide el empate de Externos y se guarda con la marca del grupo', async () => {
      expect(
        (await service.getMyTies(asProf(PA))).map((t) => t.tieKey),
      ).toContain(externalKey);
      await service.decide(asProf(PA), {
        tieKey: externalKey,
        orderedTeamIds: [7, 6],
      });
      expect(
        prisma.tieBreakDecision.create.mock.calls[0][0].data,
      ).toMatchObject({
        tieKey: externalKey,
        level: null,
        externalGroup: true,
        orderedTeamIds: [7, 6],
      });
      const r = await service.getRanking({});
      expect(r.external!.teams.map((t) => [t.teamId, t.position])).toEqual([
        [7, 1],
        [6, 2],
      ]);
    });

    it('finalize guarda las posiciones de Externos con su nivel y la marca del grupo', async () => {
      await service.decide(asProf(PA), {
        tieKey: sameProfKey,
        orderedTeamIds: [1, 2],
      });
      await service.decide(asProf(PA), {
        tieKey: externalKey,
        orderedTeamIds: [6, 7],
      });

      const out = await service.finalize(admin);

      const saved = prisma.rankingResult.createMany.mock.calls[0][0].data;
      expect(saved.filter((d: any) => d.externalGroup)).toEqual([
        expect.objectContaining({
          teamId: 6,
          level: 1,
          finalPosition: 1,
          externalGroup: true,
        }),
        expect.objectContaining({
          teamId: 7,
          level: 2,
          finalPosition: 2,
          externalGroup: true,
        }),
      ]);
      expect(out.levels).toContainEqual({
        level: null,
        external: true,
        label: 'Externos',
        teams: 2,
      });
      expect((await service.getRanking({})).finalized?.matchesCurrent).toBe(
        true,
      );
    });

    it('orderRows (by-n): la posición de un externo es la de su grupo', async () => {
      const out = await service.orderRows(state.rows, EDITION);
      const ext6 = out.find((r) => r.teamId === 6)!;
      const ext7 = out.find((r) => r.teamId === 7)!;
      expect([ext6.levelPosition, ext7.levelPosition].sort()).toEqual([1, 2]);
      // N1 sin el externo: 1 y 2 ocupan los puestos 1 y 2 (empate pendiente, provisional)
      expect(
        [1, 2]
          .map((id) => out.find((r) => r.teamId === id)!.levelPosition)
          .sort(),
      ).toEqual([1, 2]);
    });
  });
});
