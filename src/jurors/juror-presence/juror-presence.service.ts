import { ConflictException, Injectable } from '@nestjs/common';
import { EventConfiguration } from '@prisma/client';
import {
  ActiveEdition,
  requireActiveEdition,
} from 'src/editions/active-edition';
import {
  PROFESSOR_ROLE_NAME,
  jurorCategoryLabel,
  jurorFullName,
  jurorSelect,
} from 'src/jurors/juror-badges/juror-label';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListPresenceQueryDto } from './dto/list-presence-query.dto';
import { UpdatePresenceSettingsDto } from './dto/update-presence-settings.dto';
import { lastActivityByJuror } from './presence-activity';
import {
  DEFAULT_PRESENCE_SETTINGS,
  PresenceIndicator,
  PresenceSettings,
  computePresence,
} from './presence-status';

/** Código del 409 cuando el jurado responde "Sigo aquí" sin tener su llegada registrada. */
export const JUROR_NOT_CHECKED_IN = 'JUROR_NOT_CHECKED_IN';

type PresenceConfig = Pick<
  EventConfiguration,
  | 'evaluationsOpen'
  | 'presencePromptMinutes'
  | 'presenceResponseMinutes'
  | 'inactivityMinutes'
>;

const configSelect = {
  evaluationsOpen: true,
  presencePromptMinutes: true,
  presenceResponseMinutes: true,
  inactivityMinutes: true,
} as const;

function toSettings(config: PresenceConfig | null): PresenceSettings {
  if (!config) return { ...DEFAULT_PRESENCE_SETTINGS };
  return {
    promptEveryMinutes: config.presencePromptMinutes,
    responseWindowMinutes: config.presenceResponseMinutes,
    inactivityMinutes: config.inactivityMinutes,
  };
}

/**
 * HU-23: presencia de los jurados que ya llegaron. El jurado responde "Sigo aquí" cada cierto
 * tiempo y el administrador ve dos indicadores: "presencia sin confirmar" y "posible salida".
 *
 * Solo indica: no toca asignaciones ni asistencia. Mientras las evaluaciones estén cerradas no
 * se pregunta ni se marca a nadie (antes y después de la feria nadie califica).
 */
@Injectable()
export class JurorPresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private async context() {
    const edition = await requireActiveEdition(this.prisma);
    const config = await this.prisma.eventConfiguration.findUnique({
      where: { editionId: edition.id },
      select: configSelect,
    });
    return {
      edition,
      evaluationsOpen: config?.evaluationsOpen ?? false,
      settings: toSettings(config),
    };
  }

  /** Lo que necesita la pantalla del jurado para saber cuándo mostrar la pregunta. */
  async getMine(userId: string, now: Date = new Date()) {
    const { edition, evaluationsOpen, settings } = await this.context();
    const attendance = await this.prisma.jurorAttendance.findFirst({
      where: { jurorId: userId, editionId: edition.id, isActive: true },
      select: { checkedInAt: true, lastPresenceConfirmedAt: true },
    });

    const base = {
      edition: { id: edition.id, title: edition.title },
      serverTime: now,
      evaluationsOpen,
      settings,
    };
    if (!attendance) {
      return {
        ...base,
        checkedIn: false,
        checkedInAt: null,
        lastConfirmedAt: null,
        nextPromptAt: null,
        promptDue: false,
      };
    }

    const state = computePresence(
      {
        checkedInAt: attendance.checkedInAt,
        lastConfirmedAt: attendance.lastPresenceConfirmedAt,
        lastActivityAt: null,
      },
      settings,
      now,
    );
    return {
      ...base,
      checkedIn: true,
      checkedInAt: attendance.checkedInAt,
      lastConfirmedAt: attendance.lastPresenceConfirmedAt,
      nextPromptAt: state.nextPromptAt,
      promptDue: evaluationsOpen && state.promptDue,
    };
  }

  /** "Sigo aquí": guarda la hora del servidor y devuelve el estado nuevo. 409 sin llegada. */
  async confirmMine(userId: string, now: Date = new Date()) {
    const edition = await requireActiveEdition(this.prisma);
    const { count } = await this.prisma.jurorAttendance.updateMany({
      where: { jurorId: userId, editionId: edition.id, isActive: true },
      data: { lastPresenceConfirmedAt: now },
    });
    if (count === 0) {
      throw new ConflictException({
        statusCode: 409,
        code: JUROR_NOT_CHECKED_IN,
        message:
          'Tu llegada a la feria todavía no está registrada. Pasa por la mesa de escarapelas.',
      });
    }
    return this.getMine(userId, now);
  }

  /** Jurados de la edición activa que ya llegaron, con sus indicadores (panel, HU-12). */
  async list(query: ListPresenceQueryDto, now: Date = new Date()) {
    const { edition, evaluationsOpen, settings } = await this.context();
    const jurors = await this.findCheckedInJurors(edition);
    const activity = await lastActivityByJuror(
      this.prisma,
      edition.id,
      jurors.map((j) => j.id),
    );

    const items = jurors.map((juror) => {
      const attendance = juror.attendances[0];
      // Una evaluación anterior a la llegada (otra jornada) no dice nada de la presencia de hoy.
      const lastEvaluationAt = activity.get(juror.id);
      const lastActivityAt =
        lastEvaluationAt && lastEvaluationAt >= attendance.checkedInAt
          ? lastEvaluationAt
          : null;
      const state = computePresence(
        {
          checkedInAt: attendance.checkedInAt,
          lastConfirmedAt: attendance.lastPresenceConfirmedAt,
          lastActivityAt,
        },
        settings,
        now,
      );
      const indicators: PresenceIndicator[] = evaluationsOpen
        ? state.indicators
        : [];
      return {
        jurorId: juror.id,
        name: jurorFullName(juror),
        category: jurorCategoryLabel(juror),
        isProfessor: juror.role.name === PROFESSOR_ROLE_NAME,
        checkedInAt: attendance.checkedInAt,
        lastConfirmedAt: attendance.lastPresenceConfirmedAt,
        lastActivityAt,
        nextPromptAt: state.nextPromptAt,
        indicators,
      };
    });

    const has = (i: (typeof items)[number], k: PresenceIndicator) =>
      i.indicators.includes(k);
    const totals = {
      checkedIn: items.length,
      presenceUnconfirmed: items.filter((i) => has(i, 'PRESENCE_UNCONFIRMED'))
        .length,
      possibleLeft: items.filter((i) => has(i, 'POSSIBLE_LEFT')).length,
      withAnyIndicator: items.filter((i) => i.indicators.length > 0).length,
    };

    const filter = query.indicator;
    const data = items
      .filter((i) =>
        !filter
          ? true
          : filter === 'ANY'
            ? i.indicators.length > 0
            : has(i, filter),
      )
      .sort(
        (a, b) =>
          b.indicators.length - a.indicators.length ||
          a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      );

    return {
      edition: { id: edition.id, title: edition.title },
      serverTime: now,
      evaluationsOpen,
      settings,
      totals,
      data,
    };
  }

  private findCheckedInJurors(edition: ActiveEdition) {
    const attendanceWhere = { editionId: edition.id, isActive: true };
    return this.prisma.user.findMany({
      where: {
        ...jurorsOfEdition(edition.id),
        attendances: { some: attendanceWhere },
      },
      select: {
        ...jurorSelect,
        attendances: {
          where: attendanceWhere,
          select: { checkedInAt: true, lastPresenceConfirmedAt: true },
          take: 1,
        },
      },
    });
  }

  async getSettings() {
    const { edition, settings } = await this.context();
    return { edition: { id: edition.id, title: edition.title }, settings };
  }

  /** Cambia los parámetros de la edición activa; lo que no se envía se conserva. */
  async updateSettings(dto: UpdatePresenceSettingsDto) {
    const edition = await requireActiveEdition(this.prisma);
    const data = {
      ...(dto.promptEveryMinutes !== undefined && {
        presencePromptMinutes: dto.promptEveryMinutes,
      }),
      ...(dto.responseWindowMinutes !== undefined && {
        presenceResponseMinutes: dto.responseWindowMinutes,
      }),
      ...(dto.inactivityMinutes !== undefined && {
        inactivityMinutes: dto.inactivityMinutes,
      }),
    };
    const config = await this.prisma.eventConfiguration.upsert({
      where: { editionId: edition.id },
      update: data,
      create: { editionId: edition.id, ...data },
      select: configSelect,
    });
    return {
      edition: { id: edition.id, title: edition.title },
      settings: toSettings(config),
    };
  }
}
