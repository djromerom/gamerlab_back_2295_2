import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findActiveEdition } from '../../editions/active-edition';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluationBlockerException } from '../evaluation-blockers';
import { EvaluationService } from '../evaluation.service';
import { scoreError } from '../score-rules';
import { DraftStatus, draftStatusOf } from './evaluation-draft-status';
import { SaveEvaluationDraftDto } from './dto/save-evaluation-draft.dto';

export const DRAFT_VERSION_CONFLICT = 'DRAFT_VERSION_CONFLICT';
export const EVALUATION_ALREADY_SUBMITTED = 'EVALUATION_ALREADY_SUBMITTED';

const NO_ACTIVE_EDITION = 'No hay una edición activa configurada';

export type DraftScore = { criterionId: number; score: number };

/** Lo que recibe el front por cada borrador. */
export type EvaluationDraftView = {
  videogameId: number;
  videogameName: string;
  teamId: number;
  teamName: string;
  teamCode: string;
  details: DraftScore[];
  comments: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  status: DraftStatus;
  blockedReason?: string;
};

type DraftData = {
  scores: Prisma.InputJsonValue;
  comments: string | null;
  editionId: number;
};

const draftInclude = {
  videogame: {
    select: {
      name: true,
      team: { select: { id: true, teamName: true, teamCode: true } },
    },
  },
} satisfies Prisma.EvaluationDraftInclude;

type DraftRow = Prisma.EvaluationDraftGetPayload<{
  include: typeof draftInclude;
}>;

/**
 * HU-18 (ARK-104): borradores de evaluación del jurado en el servidor.
 *
 * - El borrador nunca cuenta como evaluación: vive en `borrador_evaluacion`, no en `evaluacion`.
 * - Se puede guardar con las evaluaciones cerradas y sin haber digitado el código del grupo
 *   (HU-19): lo que se bloquea es el envío. Sí se exige que el juego se pueda calificar
 *   (asignación, edición activa, colegios), con los mismos bloqueos que el envío.
 * - Concurrencia: cada guardado manda la `version` que conoce; si otra pestaña, dispositivo o un
 *   reintento atrasado ya la cambió, responde 409 DRAFT_VERSION_CONFLICT con el borrador actual.
 *   0 significa «no hay borrador activo»: así un autoguardado atrasado no revive un borrador ya
 *   descartado o enviado (ambos suben la versión).
 */
@Injectable()
export class EvaluationDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluations: EvaluationService,
  ) {}

  async save(
    jurorId: string,
    videogameId: number,
    dto: SaveEvaluationDraftDto,
  ): Promise<EvaluationDraftView> {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) throw new BadRequestException(NO_ACTIVE_EDITION);

    const { actor, professorRoleId } =
      await this.evaluations.loadActor(jurorId);
    const blockers = await this.evaluations.findEvaluationBlockers(
      actor,
      [videogameId],
      edition.id,
      professorRoleId,
    );
    const blocker = blockers.get(videogameId);
    if (blocker) throw evaluationBlockerException(blocker);

    const submitted = await this.prisma.evaluation.findUnique({
      where: { jurado_videojuego_unique: { jurorId, videogameId } },
      select: { id: true },
    });
    if (submitted) {
      throw new ConflictException({
        statusCode: 409,
        code: EVALUATION_ALREADY_SUBMITTED,
        message:
          'Ya enviaste la evaluación de este grupo; el borrador ya no se puede guardar.',
        evaluationId: submitted.id,
      });
    }

    const details = await this.validDetails(dto.details ?? []);
    const data: DraftData = {
      scores: details as unknown as Prisma.InputJsonValue,
      comments: dto.comments ?? null,
      editionId: edition.id,
    };

    const written =
      dto.version === 0
        ? await this.createOrReactivate(jurorId, videogameId, data)
        : (
            await this.prisma.evaluationDraft.updateMany({
              where: {
                jurorId,
                videogameId,
                isActive: true,
                version: dto.version,
              },
              data: { ...data, version: { increment: 1 } },
            })
          ).count === 1;
    if (!written) await this.throwVersionConflict(jurorId, videogameId);

    const row = await this.prisma.evaluationDraft.findUniqueOrThrow({
      where: { borrador_jurado_videojuego_unique: { jurorId, videogameId } },
      include: draftInclude,
    });
    return this.toView(row, draftStatusOf(false, undefined));
  }

  /** Borradores activos del jurado en la edición activa, el más reciente primero. */
  async list(jurorId: string): Promise<EvaluationDraftView[]> {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) return [];
    const rows = await this.prisma.evaluationDraft.findMany({
      where: { jurorId, isActive: true, editionId: edition.id },
      include: draftInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return this.withStatus(jurorId, rows, edition.id);
  }

  /** El borrador activo de un juego, o `null`. */
  async findOne(
    jurorId: string,
    videogameId: number,
  ): Promise<{ draft: EvaluationDraftView | null }> {
    const row = await this.prisma.evaluationDraft.findFirst({
      where: { jurorId, videogameId, isActive: true },
      include: draftInclude,
    });
    if (!row) return { draft: null };
    const edition = await findActiveEdition(this.prisma);
    const [draft] = await this.withStatus(jurorId, [row], edition?.id);
    return { draft };
  }

  /** Descartar (borrado lógico). Idempotente: si no había borrador activo, `discarded: false`. */
  async discard(jurorId: string, videogameId: number) {
    const { count } = await this.prisma.evaluationDraft.updateMany({
      where: { jurorId, videogameId, isActive: true },
      data: { isActive: false, version: { increment: 1 } },
    });
    return { discarded: count > 0 };
  }

  /**
   * Notas parciales: se exige criterio activo, sin repetir y puntaje válido (0 a 5, 2 decimales),
   * pero no que estén todos los criterios: eso se exige al enviar.
   */
  private async validDetails(details: DraftScore[]): Promise<DraftScore[]> {
    if (details.length === 0) return [];
    const active = await this.prisma.criterion.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const activeIds = new Set(active.map((c) => c.id));
    const seen = new Set<number>();
    return details.map(({ criterionId, score }) => {
      if (!activeIds.has(criterionId)) {
        throw new BadRequestException(
          `Criterion with id ${criterionId} is not valid or not active.`,
        );
      }
      if (seen.has(criterionId)) {
        throw new BadRequestException(
          `El criterio ${criterionId} está repetido en la evaluación.`,
        );
      }
      seen.add(criterionId);
      const invalid = scoreError(criterionId, score);
      if (invalid) throw new BadRequestException(invalid);
      return { criterionId, score };
    });
  }

  /** version 0: reactiva el borrador descartado/enviado o crea uno. `false` si ya hay uno activo. */
  private async createOrReactivate(
    jurorId: string,
    videogameId: number,
    data: DraftData,
  ): Promise<boolean> {
    const reactivated = await this.prisma.evaluationDraft.updateMany({
      where: { jurorId, videogameId, isActive: false },
      data: { ...data, isActive: true, version: { increment: 1 } },
    });
    if (reactivated.count === 1) return true;
    try {
      await this.prisma.evaluationDraft.create({
        data: { jurorId, videogameId, ...data },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002') return false;
      throw error;
    }
  }

  private async throwVersionConflict(
    jurorId: string,
    videogameId: number,
  ): Promise<never> {
    const { draft } = await this.findOne(jurorId, videogameId);
    throw new ConflictException({
      statusCode: 409,
      code: DRAFT_VERSION_CONFLICT,
      message:
        'El borrador cambió en otra pestaña o dispositivo. Carga la versión actual antes de seguir.',
      draft,
    });
  }

  /** Estado A1 de cada borrador, con una consulta de bloqueos y una de envíos para todos. */
  private async withStatus(
    jurorId: string,
    rows: DraftRow[],
    activeEditionId: number | undefined,
  ): Promise<EvaluationDraftView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.videogameId);

    let blockers = new Map<number, string>();
    if (activeEditionId === undefined) {
      blockers = new Map(ids.map((id) => [id, NO_ACTIVE_EDITION]));
    } else {
      const { actor, professorRoleId } =
        await this.evaluations.loadActor(jurorId);
      // Sin check-in no se bloquea la lista: el borrador sigue pendiente y es el envío (o el
      // guardado) el que responde 409. Si no, el front ofrecería «descartar» lo escrito.
      blockers = await this.evaluations.findEvaluationBlockers(
        actor,
        ids,
        activeEditionId,
        professorRoleId,
        { requireCheckIn: false },
      );
    }

    const submitted = await this.prisma.evaluation.findMany({
      where: { jurorId, videogameId: { in: ids } },
      select: { videogameId: true },
    });
    const submittedIds = new Set(submitted.map((e) => e.videogameId));

    return rows.map((row) =>
      this.toView(
        row,
        draftStatusOf(
          submittedIds.has(row.videogameId),
          blockers.get(row.videogameId),
        ),
      ),
    );
  }

  private toView(
    row: DraftRow,
    status: { status: DraftStatus; blockedReason?: string },
  ): EvaluationDraftView {
    return {
      videogameId: row.videogameId,
      videogameName: row.videogame.name,
      teamId: row.videogame.team.id,
      teamName: row.videogame.team.teamName,
      teamCode: row.videogame.team.teamCode,
      details: Array.isArray(row.scores) ? (row.scores as DraftScore[]) : [],
      comments: row.comments,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...status,
    };
  }
}
