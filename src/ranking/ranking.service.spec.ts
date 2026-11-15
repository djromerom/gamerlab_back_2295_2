import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROLE_IDS } from '../auth/constants/roles';
import { buildTieKey } from './ranking.logic';
import { RankingService } from './ranking.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import {
  EDITION,
  PA,
  PB,
  makePrisma,
  scoreRow,
  team,
} from './ranking.prisma.mock';

/**
 * HU-04 (ARK-98): quién puede decidir un empate, qué se registra y el cierre del ranking.
 * Prisma en memoria (`ranking.prisma.mock.ts`); la vista y las consultas reales se prueban en
 * test/ranking.e2e-spec.ts. El grupo Externos (HU-38) está en `ranking.service.external.spec.ts`.
 */

const admin = { id: 'admin', roleId: ROLE_IDS.ADMIN } as any;
const asProf = (p: { id: string }) =>
  ({ id: p.id, roleId: ROLE_IDS.PROFESSOR }) as any;
const sameProfKey = buildTieKey(EDITION, 1, 4.5, [1, 2]);
const registrationKey = buildTieKey(EDITION, 2, 4, [3, 4]);

describe('RankingService (HU-04)', () => {
  let prisma: any;
  let state: ReturnType<typeof makePrisma>['state'];
  let service: RankingService;

  beforeEach(() => {
    ({ prisma, state } = makePrisma());
    service = new RankingService(prisma, blobRefsPassthrough());
  });

  it('getRanking devuelve niveles, ponderación y empates pendientes', async () => {
    const r = await service.getRanking({});
    expect(r.editionId).toBe(EDITION);
    expect(r.weighting).toEqual({
      configured: true,
      juniorPct: 40,
      seniorPct: 60,
    });
    expect(r.pendingTies).toBe(1);
    expect(r.finalized).toBeNull();
    expect(r.levels.map((l) => l.label)).toEqual(['N1', 'N2']);
    // N2: profesores distintos → primero el inscrito antes (equipo 4)
    expect(r.levels[1].teams.map((t) => t.teamId)).toEqual([4, 3, 5]);
  });

  it('getRanking lista aparte los equipos sin nivel en el código', async () => {
    state.rows.push(scoreRow(6, 'SIN-NIVEL', 4.9));
    state.teams.push(team(6, 4, [PA]));
    const r = await service.getRanking({});
    expect(r.withoutLevel).toEqual([
      { teamId: 6, teamCode: 'SIN-NIVEL', teamName: 'Equipo 6' },
    ]);
    expect(r.levels.flatMap((l) => l.teams.map((t) => t.teamId))).not.toContain(
      6,
    );
    expect((await service.getRanking({ level: 1 })).withoutLevel).toHaveLength(
      1,
    );
  });

  it('solo toma profesores de integrantes y NRC activos', async () => {
    await service.getRanking({});
    const { select } = prisma.team.findMany.mock.calls[0][0];
    expect(select.members.where).toEqual({ isActive: true });
    expect(select.members.select.nrcs.where).toEqual({
      editionId: EDITION,
      isActive: true,
    });
  });

  it('getRanking filtra por nivel y 404 si la edición no existe', async () => {
    const r = await service.getRanking({ level: 2 });
    expect(r.levels.map((l) => l.level)).toEqual([2]);
    await expect(service.getRanking({ editionId: 99 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getMyTies solo trae los empates que decide ese profesor', async () => {
    expect((await service.getMyTies(asProf(PA))).map((t) => t.tieKey)).toEqual([
      sameProfKey,
    ]);
    expect(await service.getMyTies(asProf(PB))).toEqual([]);
  });

  describe('decide', () => {
    it('el profesor común elige el orden y queda registrado como PROFESSOR', async () => {
      const res = await service.decide(asProf(PA), {
        tieKey: sameProfKey,
        orderedTeamIds: [1, 2],
        reason: 'Más pulido',
      });
      expect(res).toMatchObject({
        method: 'PROFESSOR',
        orderedTeamIds: [1, 2],
        reason: 'Más pulido',
      });
      expect(
        prisma.tieBreakDecision.create.mock.calls[0][0].data,
      ).toMatchObject({
        editionId: EDITION,
        level: 1,
        score: 4.5,
        teamIds: [1, 2],
        decidedById: PA.id,
      });
      const r = await service.getRanking({ level: 1 });
      expect(r.levels[0].teams.map((t) => t.teamId)).toEqual([1, 2]);
      expect(r.pendingTies).toBe(0);
    });

    it('el profesor puede preferir el criterio de inscripción', async () => {
      const res = await service.decide(asProf(PA), {
        tieKey: sameProfKey,
        useRegistration: true,
      });
      expect(res.method).toBe('REGISTRATION');
      expect(res.orderedTeamIds).toEqual([2, 1]);
      expect(res.reason).toMatch(
        /^El profesor prefirió no elegir\. Criterio de inscripción/,
      );
    });

    it('otro profesor recibe 403', async () => {
      await expect(
        service.decide(asProf(PB), {
          tieKey: sameProfKey,
          orderedTeamIds: [1, 2],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('un empate por inscripción no se decide (409)', async () => {
      await expect(
        service.decide(admin, {
          tieKey: registrationKey,
          orderedTeamIds: [3, 4],
          reason: 'x',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('un empate que ya no existe da 404', async () => {
      await expect(
        service.decide(asProf(PA), {
          tieKey: buildTieKey(EDITION, 1, 4.4, [1, 2]),
          orderedTeamIds: [1, 2],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('no se decide dos veces (409)', async () => {
      await service.decide(asProf(PA), {
        tieKey: sameProfKey,
        orderedTeamIds: [1, 2],
      });
      await expect(
        service.decide(asProf(PA), {
          tieKey: sameProfKey,
          orderedTeamIds: [2, 1],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('valida el orden y que venga orden o useRegistration', async () => {
      await expect(
        service.decide(asProf(PA), { tieKey: sameProfKey }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.decide(asProf(PA), {
          tieKey: sameProfKey,
          orderedTeamIds: [1, 5],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el administrador debe dar el motivo y queda como ADMIN', async () => {
      await expect(
        service.decide(admin, { tieKey: sameProfKey, orderedTeamIds: [2, 1] }),
      ).rejects.toThrow(BadRequestException);
      const res = await service.decide(admin, {
        tieKey: sameProfKey,
        orderedTeamIds: [2, 1],
        reason: 'El profesor no respondió',
      });
      expect(res).toMatchObject({
        method: 'ADMIN',
        reason: 'El profesor no respondió',
      });
    });

    it('con la misma fecha de inscripción no se puede usar el criterio de inscripción', async () => {
      state.teams[3].registrationDate = state.teams[2].registrationDate;
      await expect(
        service.decide(admin, {
          tieKey: registrationKey,
          useRegistration: true,
        }),
      ).rejects.toThrow(BadRequestException);
      const res = await service.decide(admin, {
        tieKey: registrationKey,
        orderedTeamIds: [3, 4],
        reason: 'Sorteo',
      });
      expect(res.method).toBe('ADMIN');
    });
  });

  describe('finalize', () => {
    it('con empates pendientes responde 409 y los lista', async () => {
      await expect(service.finalize(admin)).rejects.toMatchObject({
        response: {
          pendingTies: [{ tieKey: sameProfKey, level: 1, rule: 'PROFESSOR' }],
        },
      });
      expect(prisma.rankingResult.createMany).not.toHaveBeenCalled();
    });

    it('guarda posiciones por nivel y registra los desempates por inscripción', async () => {
      await service.decide(asProf(PA), {
        tieKey: sameProfKey,
        orderedTeamIds: [1, 2],
      });
      const res = await service.finalize(admin);
      expect(res).toMatchObject({
        editionId: EDITION,
        teams: 5,
        registeredDecisions: 1,
      });
      expect(prisma.rankingResult.deleteMany).toHaveBeenCalledWith({
        where: { editionId: EDITION },
      });
      expect(
        state.results.map((r) => [
          r.level,
          r.teamId,
          r.finalPosition,
          r.wasTied,
        ]),
      ).toEqual([
        [1, 1, 1, true],
        [1, 2, 2, true],
        [2, 4, 1, true],
        [2, 3, 2, true],
        [2, 5, 3, false],
      ]);
      const auto = state.decisions.find((d) => d.tieKey === registrationKey);
      expect(auto).toMatchObject({
        method: 'REGISTRATION',
        orderedTeamIds: [4, 3],
        decidedById: 'admin',
      });

      const after = await service.getRanking({});
      expect(after.finalized).toMatchObject({ matchesCurrent: true });
      state.rows[4].finalScore = 4.9;
      expect((await service.getRanking({})).finalized).toMatchObject({
        matchesCurrent: false,
      });
    });
  });

  it('orderRows (by-n) usa el orden oficial dentro del nivel y la inscripción entre niveles', async () => {
    await service.decide(asProf(PA), {
      tieKey: sameProfKey,
      orderedTeamIds: [1, 2],
    });
    state.rows[2].finalScore = 4.5; // equipo 3 (N2) empata en nota con 1 y 2 (N1)
    const out = await service.orderRows(state.rows, EDITION);
    // 1 antes que 2 por la decisión; 3 (N2, inscrito el día 9) después de 2 (inscrito el día 2)
    expect(out.map((r) => r.teamId)).toEqual([1, 2, 3, 4, 5]);
    expect(out[0]).toMatchObject({
      position: 1,
      levelPosition: 1,
      wasTied: true,
      rankingScore: 4.5,
      tieBreakerScore: null,
    });
    expect(out[4]).toMatchObject({ wasTied: false, tiePending: false });
    expect(prisma.rankingResult.createMany).not.toHaveBeenCalled();
  });

  it('firma el logo del videojuego cuando es una referencia a un upload', async () => {
    state.rows[0].videogameLogoUrl = 'upload:L1' as any;
    const signer = {
      resolveKeys: (rows: any[], keys: string[]) =>
        Promise.resolve(
          rows.map((r) => ({
            ...r,
            ...Object.fromEntries(
              keys.map((k) => [
                k,
                r[k] ? `https://blob.test/${r[k]}?sig=s` : r[k],
              ]),
            ),
          })),
        ),
    };
    const signed = new RankingService(prisma, signer as any);
    const r = await signed.getRanking({ level: 1 });
    expect(r.levels[0].teams.find((t) => t.teamId === 1)?.logoUrl).toBe(
      'https://blob.test/upload:L1?sig=s',
    );
  });
});
