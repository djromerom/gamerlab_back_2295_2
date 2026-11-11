import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus, Prisma, TieBreakMethod } from '@prisma/client';
import { ROLE_IDS } from '../auth/constants/roles';
import { AppUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { snapshotWeighting } from '../evaluation/final-score';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { DecideTieDto } from './dto/decide-tie.dto';
import { RankingQueryDto, TiesQueryDto } from './dto/ranking-query.dto';
import {
  DEFAULT_PODIUM_SIZE,
  DecisionRef,
  LevelRanking,
  PersonRef,
  ScoreRow,
  TeamInfo,
  TieGroup,
  buildLevelRankings,
  teamsWithoutLevel,
  parseLevel,
  registrationReason,
  validateOrder,
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

  /** Empates de la edición activa que el profesor puede decidir (pendientes y ya decididos). */
  async getMyTies(user: AppUser): Promise<TieGroup[]> {
    const editionId = await this.resolveEditionId();
    const snapshot = await this.buildSnapshot(editionId);
    return snapshot.levels
      .flatMap((l) => l.ties)
      .filter(
        (t) =>
          t.rule === 'PROFESSOR' && t.deciders.some((d) => d.id === user.id),
      );
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
   * Registra la decisión sobre un empate.
   * - Profesor: solo empates de la regla PROFESSOR en los que es profesor común; elige el orden
   *   o prefiere el criterio de inscripción (`useRegistration`).
   * - Administrador: cualquier empate pendiente; si elige el orden a mano debe dar el motivo.
   */
  async decide(user: AppUser, dto: DecideTieDto) {
    const isAdmin = user.roleId === ROLE_IDS.ADMIN;
    const editionId = await this.resolveEditionId(
      isAdmin ? dto.editionId : undefined,
    );
    const snapshot = await this.buildSnapshot(editionId);
    const tie = snapshot.levels
      .flatMap((l) => l.ties)
      .find((t) => t.tieKey === dto.tieKey);

    if (!tie) {
      throw new NotFoundException(
        'Ese empate ya no existe: las notas cambiaron. Vuelve a cargar el ranking.',
      );
    }
    if (tie.decision) {
      throw new ConflictException(
        'Este empate ya tiene una decisión registrada.',
      );
    }
    if (tie.rule === 'REGISTRATION') {
      throw new ConflictException(
        'Este empate se resuelve por fecha de inscripción; no necesita decisión.',
      );
    }
    if (
      !isAdmin &&
      !(tie.rule === 'PROFESSOR' && tie.deciders.some((d) => d.id === user.id))
    ) {
      throw new ForbiddenException(
        'Solo el profesor de los grupos empatados puede decidir este empate.',
      );
    }

    const note = dto.reason?.trim();
    let method: TieBreakMethod;
    let orderedTeamIds: number[];
    let reason: string;

    if (dto.useRegistration) {
      if (tie.rule === 'MANUAL') {
        throw new BadRequestException(
          'Hay grupos con la misma fecha de inscripción; indica el orden a mano.',
        );
      }
      method = TieBreakMethod.REGISTRATION;
      orderedTeamIds = [...tie.teams]
        .sort(
          (a, b) =>
            Date.parse(a.registrationDate) - Date.parse(b.registrationDate) ||
            a.teamId - b.teamId,
        )
        .map((t) => t.teamId);
      reason = [
        isAdmin
          ? 'El administrador aplicó el criterio de inscripción.'
          : 'El profesor prefirió no elegir.',
        registrationReason(tie.teams),
        note,
      ]
        .filter(Boolean)
        .join(' ');
    } else {
      if (!dto.orderedTeamIds?.length) {
        throw new BadRequestException(
          'Indica el orden de los equipos (orderedTeamIds) o useRegistration.',
        );
      }
      const error = validateOrder(tie, dto.orderedTeamIds);
      if (error) throw new BadRequestException(error);
      if (isAdmin && !note) {
        throw new BadRequestException(
          'El administrador debe indicar el motivo de la decisión.',
        );
      }
      method = isAdmin ? TieBreakMethod.ADMIN : TieBreakMethod.PROFESSOR;
      orderedTeamIds = dto.orderedTeamIds;
      reason = note ?? 'Orden elegido por el profesor.';
    }

    try {
      const created = await this.prisma.tieBreakDecision.create({
        data: {
          editionId,
          level: tie.level,
          score: tie.score,
          tieKey: tie.tieKey,
          teamIds: tie.teams.map((t) => t.teamId),
          orderedTeamIds,
          method,
          reason: reason.slice(0, 500),
          decidedById: user.id,
        },
      });
      return {
        id: created.id,
        tieKey: created.tieKey,
        method: created.method,
        orderedTeamIds: created.orderedTeamIds,
        reason: created.reason,
        decidedAt: created.createdAt.toISOString(),
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Este empate ya tiene una decisión registrada.',
        );
      }
      throw e;
    }
  }

  /**
   * Define el ranking final de la edición: exige que no haya empates pendientes, registra como
   * decisión los empates resueltos por inscripción y guarda las posiciones por nivel en
   * `resultado_ranking` (reemplaza lo guardado antes para esa edición).
   */
  async finalize(user: AppUser, editionId?: number) {
    const id = await this.resolveEditionId(editionId);
    const snapshot = await this.buildSnapshot(id);
    const ties = snapshot.levels.flatMap((l) => l.ties);
    const pending = ties.filter((t) => t.status === 'PENDING');
    if (pending.length > 0) {
      throw new ConflictException({
        message:
          'Hay empates sin resolver; resuélvelos antes de definir el ranking final.',
        pendingTies: pending.map((t) => ({
          tieKey: t.tieKey,
          level: t.level,
          rule: t.rule,
        })),
      });
    }

    const automatic = ties.filter((t) => !t.decision);
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

    await this.prisma.$transaction(async (tx) => {
      if (automatic.length > 0) {
        await tx.tieBreakDecision.createMany({
          data: automatic.map((t) => ({
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
      }
      await tx.rankingResult.deleteMany({ where: { editionId: id } });
      if (results.length > 0)
        await tx.rankingResult.createMany({ data: results });
    });

    return {
      editionId: id,
      teams: results.length,
      levels: snapshot.levels.map((l) => ({
        level: l.level,
        label: l.label,
        teams: l.teams.length,
      })),
      registeredDecisions: automatic.length,
    };
  }

  /**
   * Ordena filas de `vw_team_final_scores` (cualquier mezcla de niveles) para la ruta pública
   * `final-score/by-n`: dentro de un nivel usa el orden oficial (decisiones e inscripción); entre
   * niveles distintos con la misma nota, la inscripción. Sin escrituras.
   */
  async orderRows<T extends Partial<ScoreRow>>(rows: T[], editionId: number) {
    const ids = rows
      .map((r) => Number(r.teamId))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (rows.length === 0) return [];
    const [teams, decisions] = await Promise.all([
      this.loadTeams(editionId, ids),
      this.loadDecisions(editionId),
    ]);
    const levels = buildLevelRankings({
      editionId,
      rows: rows.map((r) => this.toScoreRow(r)),
      teams,
      decisions,
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
    const [rows, teams, decisions, weighting, saved] = await Promise.all([
      this.prisma.teamFinalScore.findMany({ where: { editionId } }),
      this.loadTeams(editionId),
      this.loadDecisions(editionId),
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
      decisions,
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

  private async loadDecisions(
    editionId: number,
  ): Promise<Map<string, DecisionRef>> {
    const rows = await this.prisma.tieBreakDecision.findMany({
      where: { editionId },
      include: {
        decidedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return new Map(
      rows.map((d) => [
        d.tieKey,
        {
          id: d.id,
          tieKey: d.tieKey,
          method: d.method,
          reason: d.reason,
          orderedTeamIds: d.orderedTeamIds,
          decidedBy: { id: d.decidedBy.id, name: personName(d.decidedBy) },
          decidedAt: d.createdAt,
        },
      ]),
    );
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
