import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JurorEditionStatus, JurorType, Prisma } from '@prisma/client';
import { findUserByEmailCaseInsensitive } from '../common/utils/find-user-by-email';
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
  jurorCategoryLabel,
  jurorSelect,
} from '../juror-badges/juror-label';
import { handlePrismaError } from '../prisma/prisma-exceptions.util';
import { PrismaService } from '../prisma/prisma.service';
import { EditionIdDto } from './dto/edition-id.dto';
import { EnrollJurorDto } from './dto/enroll-juror.dto';
import { ListEditionJurorsQueryDto } from './dto/list-edition-jurors-query.dto';
import { UpdateJurorEditionStatusDto } from './dto/update-juror-edition-status.dto';
import {
  assertWritable,
  findPreviousEdition,
  resolveEdition,
  toEditionSummary,
} from './edition-resolver';
import { buildPage } from './juror-edition-list';
import {
  AUTOMATIC_STATUS,
  EditionJurorItem,
  ImportPreviousResult,
  PaginatedEditionJurors,
  StatusRowResult,
  UpdateStatusResult,
} from './juror-edition.types';
import { professorsOfEdition } from './jurors-of-edition';

const STATUS_LABEL: Record<JurorEditionStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Declinó',
};

/** Datos de un jurado para la página del administrador (incluye el correo). */
const listedJurorSelect = {
  ...jurorSelect,
  email: true,
} satisfies Prisma.UserSelect;

type ListedJuror = Prisma.UserGetPayload<{ select: typeof listedJurorSelect }>;

const enrolledRowSelect = {
  type: true,
  status: true,
  updatedAt: true,
  juror: { select: listedJurorSelect },
} satisfies Prisma.JurorEditionSelect;

type EnrolledRow = Prisma.JurorEditionGetPayload<{
  select: typeof enrolledRowSelect;
}>;

function toEnrolledItem(row: EnrolledRow): EditionJurorItem {
  return {
    jurorId: row.juror.id,
    firstName: row.juror.firstName,
    lastName: row.juror.lastName,
    email: row.juror.email,
    category: jurorCategoryLabel(row.juror),
    type: row.type,
    status: row.status,
    source: 'ENROLLED',
    updatedAt: row.updatedAt,
  };
}

function toProfessorItem(professor: ListedJuror): EditionJurorItem {
  return {
    jurorId: professor.id,
    firstName: professor.firstName,
    lastName: professor.lastName,
    email: professor.email,
    category: jurorCategoryLabel(professor),
    type: null,
    status: AUTOMATIC_STATUS,
    source: 'PROFESSOR_NRC',
    updatedAt: null,
  };
}

/** Jurados externos (rol Jurado) con cuenta activa. */
const activeJurorWhere: Prisma.UserWhereInput = {
  isActive: true,
  role: { name: JUROR_ROLE_NAME },
};

@Injectable()
export class JurorEditionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista de la edición: jurados inscritos más profesores automáticos, filtrada y paginada. */
  async list(
    query: ListEditionJurorsQueryDto,
  ): Promise<PaginatedEditionJurors> {
    const edition = await resolveEdition(this.prisma, query.editionId);

    const [rows, professors] = await Promise.all([
      this.prisma.jurorEdition.findMany({
        where: { editionId: edition.id, juror: activeJurorWhere },
        select: enrolledRowSelect,
      }),
      this.prisma.user.findMany({
        where: professorsOfEdition(edition.id),
        select: listedJurorSelect,
      }),
    ]);

    const items = new Map<string, EditionJurorItem>();
    for (const row of rows) items.set(row.juror.id, toEnrolledItem(row));
    // Un profesor con NRC activo es automático aunque tenga una fila (no debería tenerla).
    for (const professor of professors) {
      items.set(professor.id, toProfessorItem(professor));
    }

    return {
      ...buildPage([...items.values()], query),
      edition: toEditionSummary(edition),
    };
  }

  /**
   * Trae como Pendientes a los confirmados de la edición anterior, sin duplicar. Si la anterior
   * no tiene lista (ediciones previas a HU-25), trae a todos los jurados activos.
   */
  async importPrevious(
    dto: EditionIdDto,
    actorId: string,
  ): Promise<ImportPreviousResult> {
    const edition = await resolveEdition(this.prisma, dto.editionId);
    assertWritable(edition);
    const previous = await findPreviousEdition(this.prisma, edition);

    const previousRows = await this.prisma.jurorEdition.count({
      where: { editionId: previous.id },
    });
    const fallback = previousRows === 0;

    const candidates: { jurorId: string; type: JurorType }[] = fallback
      ? (
          await this.prisma.user.findMany({
            where: activeJurorWhere,
            select: { id: true, jurorType: true },
          })
        ).map((user) => ({
          jurorId: user.id,
          type: user.jurorType ?? JurorType.OFFICIAL,
        }))
      : await this.prisma.jurorEdition.findMany({
          where: {
            editionId: previous.id,
            status: JurorEditionStatus.CONFIRMED,
            juror: activeJurorWhere,
          },
          select: { jurorId: true, type: true },
        });

    const { count } = candidates.length
      ? await this.prisma.jurorEdition.createMany({
          data: candidates.map((candidate) => ({
            jurorId: candidate.jurorId,
            editionId: edition.id,
            type: candidate.type,
            status: JurorEditionStatus.PENDING,
            updatedById: actorId,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

    return {
      sourceEditionId: previous.id,
      created: count,
      skipped: candidates.length - count,
      fallback,
    };
  }

  /** Confirma, declina o cambia el tipo en bloque, con resultado por fila. */
  async updateStatus(
    dto: UpdateJurorEditionStatusDto,
    actorId: string,
  ): Promise<UpdateStatusResult> {
    const edition = await resolveEdition(this.prisma, dto.editionId);
    assertWritable(edition);

    const ids = dto.items.map((item) => item.jurorId);
    const enrolled = new Set(
      (
        await this.prisma.jurorEdition.findMany({
          where: { editionId: edition.id, jurorId: { in: ids } },
          select: { jurorId: true },
        })
      ).map((row) => row.jurorId),
    );
    const missing = ids.filter((id) => !enrolled.has(id));
    const professors = new Set(
      missing.length
        ? (
            await this.prisma.user.findMany({
              where: {
                id: { in: missing },
                role: { name: PROFESSOR_ROLE_NAME },
              },
              select: { id: true },
            })
          ).map((user) => user.id)
        : [],
    );

    const results: StatusRowResult[] = dto.items.map((item) => {
      if (enrolled.has(item.jurorId))
        return { jurorId: item.jurorId, ok: true };
      return {
        jurorId: item.jurorId,
        ok: false,
        error: professors.has(item.jurorId) ? 'IS_PROFESSOR' : 'NOT_ENROLLED',
      };
    });

    const updates = dto.items
      .filter((item) => enrolled.has(item.jurorId))
      .map((item) =>
        this.prisma.jurorEdition.update({
          where: {
            jurorId_editionId: { jurorId: item.jurorId, editionId: edition.id },
          },
          data: {
            status: item.status,
            ...(item.type ? { type: item.type } : {}),
            updatedById: actorId,
          },
          select: { id: true },
        }),
      );

    const declineRest = dto.declineRemaining
      ? [
          this.prisma.jurorEdition.updateMany({
            where: {
              editionId: edition.id,
              status: JurorEditionStatus.PENDING,
              jurorId: { notIn: ids },
            },
            data: { status: JurorEditionStatus.DECLINED, updatedById: actorId },
          }),
        ]
      : [];

    let declined = 0;
    try {
      const outcome = await this.prisma.$transaction([
        ...updates,
        ...declineRest,
      ]);
      if (dto.declineRemaining) {
        declined = (outcome[outcome.length - 1] as Prisma.BatchPayload).count;
      }
    } catch (error) {
      handlePrismaError(error);
    }

    return { results, declined };
  }

  /** Inscribe ya confirmado a un jurado con cuenta que no estuvo en la edición anterior. */
  async enroll(
    dto: EnrollJurorDto,
    actorId: string,
  ): Promise<EditionJurorItem> {
    const edition = await resolveEdition(this.prisma, dto.editionId);
    assertWritable(edition);

    const user = await findUserByEmailCaseInsensitive(this.prisma, dto.email, {
      role: true,
    });
    if (!user || !user.isActive) {
      throw new NotFoundException(
        'No existe una cuenta activa con ese correo. Créela en Personal → Jurados y luego inscríbala aquí.',
      );
    }
    if (user.role.name !== JUROR_ROLE_NAME) {
      throw new BadRequestException(
        user.role.name === PROFESSOR_ROLE_NAME
          ? 'Los profesores no se inscriben: son jurados de la edición si tienen un NRC activo en ella'
          : 'La cuenta no tiene el rol Jurado',
      );
    }

    const existing = await this.prisma.jurorEdition.findUnique({
      where: { jurorId_editionId: { jurorId: user.id, editionId: edition.id } },
      select: { status: true },
    });
    if (existing) {
      throw new ConflictException(
        `El jurado ya está en esta edición como ${STATUS_LABEL[existing.status]}`,
      );
    }

    try {
      const row = await this.prisma.jurorEdition.create({
        data: {
          jurorId: user.id,
          editionId: edition.id,
          status: JurorEditionStatus.CONFIRMED,
          type: dto.type ?? JurorType.OFFICIAL,
          updatedById: actorId,
        },
        select: enrolledRowSelect,
      });
      return toEnrolledItem(row);
    } catch (error) {
      // Dos inscripciones simultáneas: la segunda choca con el único (jurado, edición).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El jurado ya está en esta edición');
      }
      handlePrismaError(error);
    }
  }
}
