import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findActiveEdition } from '../editions/active-edition';
import { resolveEdition } from '../juror-edition/edition-resolver';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIRMED_VIDEOGAME } from '../teams/team-status';
import { AnswerJurorSurveyDto } from './dto/answer-juror-survey.dto';
import {
  FieldSummary,
  SURVEY_FIELDS,
  SurveyProgress,
  SurveyScores,
  SurveyUnavailableReason,
  UNAVAILABLE_MESSAGES,
  summarizeFields,
  surveyUnavailableReason,
} from './survey-rules';

export const SURVEY_NOT_AVAILABLE = 'SURVEY_NOT_AVAILABLE';
export const SURVEY_ALREADY_ANSWERED = 'SURVEY_ALREADY_ANSWERED';

export interface SurveyStatus {
  editionId: number | null;
  /** true = mostrar la encuesta (terminó de evaluar y no la ha respondido). */
  available: boolean;
  reason: SurveyUnavailableReason | null;
  answered: boolean;
  answeredAt: Date | null;
  assigned: number;
  evaluated: number;
}

export interface SurveyResponseRow extends SurveyScores {
  jurorName: string;
  email: string;
  role: string;
  comments: string | null;
  createdAt: Date;
}

export interface SurveySummary {
  edition: { id: number; title: string; year: number; semester: number };
  totals: {
    /** Respuestas recibidas. */
    responses: number;
    /** Jurados de la edición que ya terminaron de evaluar (los que podían responder). */
    jurorsFinished: number;
    /** Jurados de la edición (inscritos confirmados y profesores con NRC). */
    editionJurors: number;
  };
  fields: FieldSummary[];
  comments: Pick<
    SurveyResponseRow,
    'jurorName' | 'email' | 'role' | 'comments' | 'createdAt'
  >[];
}

/** Grupo que cuenta para «terminó de evaluar»: equipo y juego activos de la edición. */
const countedVideogames = (editionId: number): Prisma.VideogameWhereInput => ({
  isActive: true,
  ...CONFIRMED_VIDEOGAME,
  team: { isActive: true, editionId },
});

/**
 * HU-17 (ARK-183): encuesta de experiencia del jurado.
 *
 * «Terminó de evaluar»: tiene al menos un grupo asignado (equipo y juego activos de la edición
 * activa) y una evaluación enviada suya en cada uno. Los borradores (HU-18) viven en otra tabla y
 * no cuentan. Cualquier evaluación del jurado sobre el juego cuenta, igual que en la lista de
 * pendientes (`/pending-games`). No depende de que las evaluaciones estén abiertas: se puede
 * responder después de la feria (flujo A1).
 */
@Injectable()
export class JurorSurveyService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string): Promise<SurveyStatus> {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) {
      return {
        editionId: null,
        available: false,
        reason: 'NO_ACTIVE_EDITION',
        answered: false,
        answeredAt: null,
        assigned: 0,
        evaluated: 0,
      };
    }
    const { progress, answeredAt } = await this.progressOf(edition.id, userId);
    const reason = surveyUnavailableReason(progress);
    return {
      editionId: edition.id,
      available: reason === null,
      reason,
      answered: progress.answered,
      answeredAt,
      assigned: progress.assigned,
      evaluated: progress.evaluated,
    };
  }

  async answer(userId: string, dto: AnswerJurorSurveyDto) {
    const status = await this.status(userId);
    if (status.reason === 'ALREADY_ANSWERED') throw this.alreadyAnswered();
    if (!status.available || status.editionId === null) {
      const reason = status.reason ?? 'NO_ACTIVE_EDITION';
      throw new ForbiddenException({
        statusCode: 403,
        code: SURVEY_NOT_AVAILABLE,
        reason,
        message: UNAVAILABLE_MESSAGES[reason],
      });
    }

    try {
      const created = await this.prisma.jurorSurveyResponse.create({
        data: {
          jurorId: userId,
          editionId: status.editionId,
          loginEase: dto.loginEase,
          groupsClarity: dto.groupsClarity,
          gradingEase: dto.gradingEase,
          stability: dto.stability,
          fairOrganization: dto.fairOrganization,
          overall: dto.overall,
          comments: dto.comments ? dto.comments : null,
        },
        select: { id: true, createdAt: true },
      });
      return {
        id: created.id,
        createdAt: created.createdAt,
        message: '¡Gracias por contarnos tu experiencia!',
      };
    } catch (error) {
      // Dos envíos a la vez (doble clic, reintento): el segundo choca con el único por edición.
      if ((error as { code?: string } | null)?.code === 'P2002') {
        throw this.alreadyAnswered();
      }
      throw error;
    }
  }

  /** Resumen para el administrador: totales, promedio y distribución por campo, y comentarios. */
  async summary(editionId?: number): Promise<SurveySummary> {
    const { edition, rows } = await this.responses(editionId);
    const finished = await this.finishedJurors(edition.id);
    return {
      edition: {
        id: edition.id,
        title: edition.title,
        year: edition.year,
        semester: edition.semester,
      },
      totals: {
        responses: rows.length,
        jurorsFinished: finished.finished,
        editionJurors: finished.editionJurors,
      },
      fields: summarizeFields(rows),
      comments: rows
        .filter((row) => row.comments)
        .map(({ jurorName, email, role, comments, createdAt }) => ({
          jurorName,
          email,
          role,
          comments,
          createdAt,
        })),
    };
  }

  /** Respuestas de la edición (la pedida o la activa), las más antiguas primero. */
  async responses(editionId?: number) {
    const edition = await resolveEdition(this.prisma, editionId);
    const found = await this.prisma.jurorSurveyResponse.findMany({
      where: { editionId: edition.id, isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        juror: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
    });
    const rows: SurveyResponseRow[] = found.map((r) => ({
      jurorName: `${r.juror.firstName} ${r.juror.lastName}`.trim(),
      email: r.juror.email,
      role: r.juror.role.name,
      ...(Object.fromEntries(
        SURVEY_FIELDS.map(({ key }) => [key, r[key]]),
      ) as SurveyScores),
      comments: r.comments,
      createdAt: r.createdAt,
    }));
    return { edition, rows };
  }

  private async progressOf(
    editionId: number,
    userId: string,
  ): Promise<{ progress: SurveyProgress; answeredAt: Date | null }> {
    const [jurorCount, games, response] = await Promise.all([
      this.prisma.user.count({ where: jurorsOfEdition(editionId, [userId]) }),
      this.prisma.videogame.findMany({
        where: {
          isActive: true,
          ...CONFIRMED_VIDEOGAME,
          team: {
            isActive: true,
            editionId,
            assignedJurors: { some: { id: userId } },
          },
        },
        select: {
          evaluations: {
            where: { jurorId: userId },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.jurorSurveyResponse.findUnique({
        where: {
          encuesta_jurado_edicion_unique: { jurorId: userId, editionId },
        },
        select: { createdAt: true },
      }),
    ]);
    return {
      progress: {
        isEditionJuror: jurorCount > 0,
        assigned: games.length,
        evaluated: games.filter((g) => g.evaluations.length > 0).length,
        answered: response !== null,
      },
      answeredAt: response?.createdAt ?? null,
    };
  }

  /** Cuántos jurados de la edición ya terminaron de evaluar, con dos consultas para todos. */
  private async finishedJurors(editionId: number) {
    const [jurors, games] = await Promise.all([
      this.prisma.user.findMany({
        where: jurorsOfEdition(editionId),
        select: { id: true },
      }),
      this.prisma.videogame.findMany({
        where: countedVideogames(editionId),
        select: {
          team: { select: { assignedJurors: { select: { id: true } } } },
          evaluations: { select: { jurorId: true } },
        },
      }),
    ]);
    const assigned = new Map<string, number>();
    const evaluated = new Map<string, number>();
    for (const game of games) {
      const evaluators = new Set(game.evaluations.map((e) => e.jurorId));
      for (const { id } of game.team.assignedJurors) {
        assigned.set(id, (assigned.get(id) ?? 0) + 1);
        if (evaluators.has(id)) evaluated.set(id, (evaluated.get(id) ?? 0) + 1);
      }
    }
    const finished = jurors.filter(({ id }) => {
      const total = assigned.get(id) ?? 0;
      return total > 0 && (evaluated.get(id) ?? 0) === total;
    }).length;
    return { finished, editionJurors: jurors.length };
  }

  private alreadyAnswered() {
    return new ConflictException({
      statusCode: 409,
      code: SURVEY_ALREADY_ANSWERED,
      message: UNAVAILABLE_MESSAGES.ALREADY_ANSWERED,
    });
  }
}
