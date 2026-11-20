import { Injectable, NotFoundException } from '@nestjs/common';
import { TieBreakMethod } from '@prisma/client';
import { AppUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { snapshotWeighting } from '../evaluation/final-score';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { RankingQueryDto, TiesQueryDto } from './dto/ranking-query.dto';
import {
  DEFAULT_PODIUM_SIZE,
  LevelRanking,
  PersonRef,
  ScoreRow,
  TeamInfo,
  TieGroup,
  buildLevelRankings,
  teamsWithoutLevel,
  parseLevel,
  registrationReason,
} from './ranking.logic';
import { findActiveEdition } from '../editions/active-edition';

const personName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

export interface RankingSnapshot {
  editionId: number;
  podiumSize: number;
  weighting: { configured: boolean; juniorPct: number; seniorPct: number };
  pendingTies: number;
  finalized: { at: string; matchesCurrent: boolean } | null;
  levels: LevelRanking[];
  /** Equipos activos cuyo código no indica nivel (`N{n}-...`): no entran a ningún ranking. */
  withoutLevel: { teamId: number; teamCode: string; teamName: string | null }[];
}

/**
 * HU-04 (ARK-98): ranking oficial por nivel, empates y su registro.
 * La nota final sale de `vw_team_final_scores` (único cálculo); aquí solo se ordena y se desempata.
 * HU-47 (ARK-304): el desempate es siempre por fecha de inscripción (y por id si coincide); las
 * decisiones guardadas antes en `decision_desempate` ya no se leen para ordenar.
 */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobRefs: BlobReferenceService,
  ) {}

  async getRanking(query: RankingQueryDto): Promise<RankingSnapshot> {
    const editionId = await this.resolveEditionId(query.editionId);
    const snapshot = await this.buildSnapshot(editionId, query.top);
    if (query.level === undefined) return snapshot;
    return {
      ...snapshot,
      levels: snapshot.levels.filter((l) => l.level === query.level),
    };
  }

  /** Podio de cada nivel y los empates que lo afectan (vista para comunicar a los profesores). */
  async getWinners(query: RankingQueryDto) {
    const snapshot = await this.getRanking(query);
    return {
      editionId: snapshot.editionId,
      podiumSize: snapshot.podiumSize,
      finalized: snapshot.finalized,
      levels: snapshot.levels.map((l) => ({
        level: l.level,
        label: l.label,
        podium: l.podium,
        ties: l.ties.filter((t) => t.affectsPodium),
        pendingTies: l.ties.filter(
          (t) => t.affectsPodium && t.status === 'PENDING',
        ).length,
      })),
    };
  }

  async getTies(query: TiesQueryDto): Promise<TieGroup[]> {
    const snapshot = await this.getRanking(query);
    return snapshot.levels
      .flatMap((l) => l.ties)
      .filter((t) => !query.status || t.status === query.status)
      .filter((t) => !query.podiumOnly || t.affectsPodium);
  }

  async getDecisions(editionId?: number) {
    const id = await this.resolveEditionId(editionId);
    const rows = await this.prisma.tieBreakDecision.findMany({
      where: { editionId: id },
      include: {
        decidedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id,
      editionId: d.editionId,
      level: d.level,
      score: d.score,
      tieKey: d.tieKey,
      teamIds: d.teamIds,
      orderedTeamIds: d.orderedTeamIds,
      method: d.method,
      reason: d.reason,
      decidedBy: { id: d.decidedBy.id, name: personName(d.decidedBy) },
      decidedAt: d.createdAt.toISOString(),
    }));
  }

  /**
   * Define el ranking final de la edición: registra como decisión (método REGISTRATION) los empates,
   * que desde HU-47 siempre se resuelven por inscripción, y guarda las posiciones por nivel en
   * `resultado_ranking` (reemplaza lo guardado antes para esa edición). Un empate que ya tenía una
   * decisión guardada (por ejemplo, de un profesor antes de HU-47) conserva esa fila como historial.
   */
  async finalize(user: AppUser, editionId?: number) {
    const id = await this.resolveEditionId(editionId);
    const snapshot = await this.buildSnapshot(id);
    const ties = snapshot.levels.flatMap((l) => l.ties);
    const results = snapshot.levels.flatMap((l) =>
      l.teams.map((t) => ({
        teamId: t.teamId,
        videogameId: t.videogameId,
        editionId: id,
        level: l.level,
        baseScore: t.finalScore,
        rankingScore: t.finalScore,
        wasTied: t.tieKey !== null,
        finalPosition: t.position,
      })),
    );

    const registeredDecisions = await this.prisma.$transaction(async (tx) => {
      let registered = 0;
      if (ties.length > 0) {
        const created = await tx.tieBreakDecision.createMany({
          data: ties.map((t) => ({
            editionId: id,
            level: t.level,
            score: t.score,
            tieKey: t.tieKey,
            teamIds: t.teams.map((x) => x.teamId),
            orderedTeamIds: t.order,
            method: TieBreakMethod.REGISTRATION,
            reason: registrationReason(t.teams).slice(0, 500),
            decidedById: user.id,
          })),
          skipDuplicates: true,
        });
        registered = created.count;
      }
      await tx.rankingResult.deleteMany({ where: { editionId: id } });
      if (results.length > 0)
        await tx.rankingResult.createMany({ data: results });
      return registered;
    });

    return {
      editionId: id,
      teams: results.length,
      levels: snapshot.levels.map((l) => ({
        level: l.level,
        label: l.label,
        teams: l.teams.length,
      })),
      registeredDecisions,
    };
  }

  /**
   * Ordena filas de `vw_team_final_scores` (cualquier mezcla de niveles) para la ruta pública
   * `final-score/by-n`: dentro de un nivel usa el orden oficial (inscripción, HU-47); entre
   * niveles distintos con la misma nota, la inscripción. Sin escrituras.
   */
  async orderRows<T extends Partial<ScoreRow>>(rows: T[], editionId: number) {
    const ids = rows
      .map((r) => Number(r.teamId))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (rows.length === 0) return [];
    const teams = await this.loadTeams(editionId, ids);
    const levels = buildLevelRankings({
      editionId,
      rows: rows.map((r) => this.toScoreRow(r)),
      teams,
    });
    const official = new Map<
      number,
      { position: number; tied: boolean; provisional: boolean }
    >();
    for (const l of levels) {
      for (const t of l.teams) {
        official.set(t.teamId, {
          position: t.position,
          tied: t.tieKey !== null,
          provisional: t.provisional,
        });
      }
    }
    const regTime = (r: T) =>
      teams.get(Number(r.teamId))?.registrationDate.getTime() ?? Infinity;
    const score = (r: T) =>
      r.finalScore === null || r.finalScore === undefined
        ? -Infinity
        : Number(r.finalScore);

    return [...rows]
      .sort((a, b) => {
        if (score(a) !== score(b)) return score(b) - score(a);
        const la = parseLevel(a.teamCode);
        const lb = parseLevel(b.teamCode);
        const oa = official.get(Number(a.teamId));
        const ob = official.get(Number(b.teamId));
        if (la !== null && la === lb && oa && ob)
          return oa.position - ob.position;
        return regTime(a) - regTime(b) || Number(a.teamId) - Number(b.teamId);
      })
      .map((r, i, all) => {
        const o = official.get(Number(r.teamId));
        const sameScore = (x?: T) =>
          x !== undefined && score(x) === score(r) && score(r) !== -Infinity;
        return {
          ...r,
          position: i + 1,
          levelPosition: o?.position ?? null,
          wasTied: o?.tied ?? (sameScore(all[i - 1]) || sameScore(all[i + 1])),
          tiePending: o?.provisional ?? false,
          rankingScore: r.finalScore ?? null,
          // El puntaje automático 70/30 se retiró con HU-04 (P-05); se dejan en null por compatibilidad.
          tieBreakerScore: null,
          jurorTieBreakerScore: null,
          professorTieBreakerScore: null,
        };
      });
  }

  // ---------------------------------------------------------------------------------------------

  private async buildSnapshot(
    editionId: number,
    top?: number,
  ): Promise<RankingSnapshot> {
    const podiumSize = top ?? DEFAULT_PODIUM_SIZE;
    const [rows, teams, weighting, saved] = await Promise.all([
      this.prisma.teamFinalScore.findMany({ where: { editionId } }),
      this.loadTeams(editionId),
      this.prisma.weighting.findUnique({ where: { editionId } }),
      this.prisma.rankingResult.findMany({
        where: { editionId, level: { not: null } },
        select: {
          teamId: true,
          finalPosition: true,
          level: true,
          updatedAt: true,
        },
      }),
    ]);

    // El logo puede ser una referencia a un upload; se firma al leer (como en by-n)
    const signed = await this.blobRefs.resolveKeys(rows, ['videogameLogoUrl']);
    const scoreRows = signed.map((r) => this.toScoreRow(r));
    const levels = buildLevelRankings({
      editionId,
      rows: scoreRows,
      teams,
      podiumSize,
    });

    return {
      editionId,
      podiumSize,
      weighting: snapshotWeighting(weighting, rows),
      pendingTies: levels
        .flatMap((l) => l.ties)
        .filter((t) => t.status === 'PENDING').length,
      finalized: this.finalizedState(saved, levels),
      levels,
      withoutLevel: teamsWithoutLevel({ editionId, rows: scoreRows, teams }),
    };
  }

  private finalizedState(
    saved: {
      teamId: number;
      finalPosition: number;
      level: number | null;
      updatedAt: Date;
    }[],
    levels: LevelRanking[],
  ): RankingSnapshot['finalized'] {
    if (saved.length === 0) return null;
    const at = new Date(Math.max(...saved.map((s) => s.updatedAt.getTime())));
    const current = levels.flatMap((l) =>
      l.teams.map((t) => `${l.level}:${t.teamId}:${t.position}`),
    );
    const stored = new Set(
      saved.map((s) => `${s.level}:${s.teamId}:${s.finalPosition}`),
    );
    const matchesCurrent =
      current.length === stored.size && current.every((k) => stored.has(k));
    return { at: at.toISOString(), matchesCurrent };
  }

  private toScoreRow(r: Partial<Record<keyof ScoreRow, unknown>>): ScoreRow {
    const num = (v: unknown) =>
      v === null || v === undefined ? null : Number(v);
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      teamId: Number(r.teamId),
      teamCode: str(r.teamCode),
      teamName: str(r.teamName),
      isExternal: Boolean(r.isExternal),
      videogameId: Number(r.videogameId),
      videogameName: str(r.videogameName),
      videogameLogoUrl: str(r.videogameLogoUrl),
      editionId: Number(r.editionId),
      avgJunior: num(r.avgJunior),
      avgSenior: num(r.avgSenior),
      finalScore: num(r.finalScore),
      juniorEvaluations: Number(r.juniorEvaluations ?? 0),
      juniorCounted: Number(r.juniorCounted ?? 0),
      seniorEvaluations: Number(r.seniorEvaluations ?? 0),
      weightingConfigured: Boolean(r.weightingConfigured),
    };
  }

  /** Fecha de inscripción y profesores (por los NRC de sus integrantes en la edición). */
  private async loadTeams(
    editionId: number,
    teamIds?: number[],
  ): Promise<Map<number, TeamInfo>> {
    const teams = await this.prisma.team.findMany({
      where: { editionId, ...(teamIds ? { id: { in: teamIds } } : {}) },
      select: {
        id: true,
        registrationDate: true,
        isActive: true,
        // Solo integrantes y NRC activos: uno dado de baja no aporta profesor al desempate.
        members: {
          where: { isActive: true },
          select: {
            nrcs: {
              where: { editionId, isActive: true },
              select: {
                professor: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    const map = new Map<number, TeamInfo>();
    for (const t of teams) {
      const professors = new Map<string, PersonRef>();
      for (const m of t.members) {
        for (const n of m.nrcs) {
          professors.set(n.professor.id, {
            id: n.professor.id,
            name: personName(n.professor),
          });
        }
      }
      map.set(t.id, {
        registrationDate: t.registrationDate,
        isActive: t.isActive,
        professors: [...professors.values()],
      });
    }
    return map;
  }

  private async resolveEditionId(editionId?: number): Promise<number> {
    if (editionId !== undefined) {
      const exists = await this.prisma.edition.findUnique({
        where: { id: editionId },
        select: { id: true },
      });
      if (!exists)
        throw new NotFoundException(`No existe la edición ${editionId}.`);
      return editionId;
    }
    const active = await findActiveEdition(this.prisma);
    if (!active) throw new NotFoundException('No hay una edición activa.');
    return active.id;
  }
}
