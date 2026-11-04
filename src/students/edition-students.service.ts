import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { escapeLike } from '../common/utils/escape-like';
import { resolveListEdition } from '../editions/list-edition';
import { ListEditionStudentsQueryDto } from './dto/list-edition-students-query.dto';
import {
  EditionStudentItem,
  EditionStudentsList,
  EditionStudentsSummary,
  PARTICIPATION_VIDEOGAME_STATUSES,
  ParticipationVideogameStatus,
} from './types/edition-students.type';

const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  studentCode: true,
  isActive: true,
  team: {
    select: {
      id: true,
      teamName: true,
      teamCode: true,
      isActive: true,
      userId: true,
      videogame: { select: { videogameStatus: { select: { status: true } } } },
    },
  },
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

/**
 * ARK-129 (HU-26): qué estudiantes participan en una edición y en qué estado.
 * «Inscrito en la edición X» = tener un integrante en un equipo de X (`Member.editionId`, BG-17).
 * Haber participado antes no inscribe a nadie: la lista sale solo de los integrantes de X.
 */
@Injectable()
export class EditionStudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEditionStudentsQueryDto): Promise<EditionStudentsList> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const edition = await resolveListEdition(this.prisma, query.editionId);
    if (!edition) {
      return {
        edition: null,
        summary: emptySummary(),
        data: [],
        metadata: pageMeta(0, 0, page, limit),
      };
    }

    const where = buildWhere(edition.id, query);
    const [rows, totalItems, summary] = await Promise.all([
      this.prisma.member.findMany({
        where,
        select: memberSelect,
        orderBy: [{ team: { teamName: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.member.count({ where }),
      this.summary(edition.id),
    ]);

    const accountStatuses = await this.accountStatusesByEmail(rows);
    const data = rows.map((row) => toItem(row, accountStatuses));
    return {
      edition,
      summary,
      data,
      metadata: pageMeta(totalItems, data.length, page, limit),
    };
  }

  private async summary(editionId: number): Promise<EditionStudentsSummary> {
    const [total, active, ...byStatus] = await Promise.all([
      this.prisma.member.count({ where: { editionId } }),
      this.prisma.member.count({ where: { editionId, isActive: true } }),
      ...PARTICIPATION_VIDEOGAME_STATUSES.map((status) =>
        this.prisma.member.count({ where: { editionId, ...videogameStatusWhere(status) } }),
      ),
    ]);
    const byVideogameStatus = Object.fromEntries(
      PARTICIPATION_VIDEOGAME_STATUSES.map((status, i) => [status, byStatus[i]]),
    ) as Record<ParticipationVideogameStatus, number>;
    return { total, active, inactive: total - active, byVideogameStatus };
  }

  /**
   * El estado de la cuenta es global (correo verificado) y solo lo tiene quien tiene cuenta: en la
   * práctica, el líder. Se cruza por correo sin distinguir mayúsculas.
   */
  private async accountStatusesByEmail(rows: MemberRow[]): Promise<Map<string, AccountInfo>> {
    const emails = [...new Set(rows.map((row) => row.email.trim().toLowerCase()))];
    if (emails.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails, mode: 'insensitive' } },
      select: { id: true, email: true, confirmationStatus: { select: { status: true } } },
    });
    return new Map(
      users.map((user) => [
        user.email.toLowerCase(),
        { userId: user.id, status: user.confirmationStatus?.status ?? null },
      ]),
    );
  }
}

interface AccountInfo {
  userId: string;
  status: string | null;
}

function videogameStatusWhere(status: ParticipationVideogameStatus): Prisma.MemberWhereInput {
  return { team: { videogame: { videogameStatus: { status } } } };
}

function buildWhere(editionId: number, query: ListEditionStudentsQueryDto): Prisma.MemberWhereInput {
  const and: Prisma.MemberWhereInput[] = [{ editionId }];
  if (query.videogameStatus) and.push(videogameStatusWhere(query.videogameStatus));
  if (query.search) {
    const contains = escapeLike(query.search);
    const text = { contains, mode: 'insensitive' as const };
    and.push({
      OR: [
        { firstName: text },
        { lastName: text },
        { email: text },
        { studentCode: text },
        { team: { teamName: text } },
      ],
    });
  }
  return { AND: and };
}

function toItem(row: MemberRow, accounts: Map<string, AccountInfo>): EditionStudentItem {
  const account = accounts.get(row.email.trim().toLowerCase());
  const status = row.team.videogame?.videogameStatus?.status ?? null;
  return {
    memberId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    studentCode: row.studentCode,
    isActive: row.isActive,
    isLeader: !!account && account.userId === row.team.userId,
    team: {
      id: row.team.id,
      teamName: row.team.teamName,
      teamCode: row.team.teamCode,
      isActive: row.team.isActive,
    },
    videogameStatus: isParticipationStatus(status) ? status : null,
    accountStatus: account?.status ?? null,
  };
}

function isParticipationStatus(value: string | null): value is ParticipationVideogameStatus {
  return (PARTICIPATION_VIDEOGAME_STATUSES as readonly string[]).includes(value ?? '');
}

function emptySummary(): EditionStudentsSummary {
  return {
    total: 0,
    active: 0,
    inactive: 0,
    byVideogameStatus: { PENDIENTE: 0, CONFIRMADO: 0, RECHAZADO: 0 },
  };
}

function pageMeta(totalItems: number, itemsOnCurrentPage: number, page: number, limit: number) {
  return {
    totalItems,
    itemsOnCurrentPage,
    currentPage: page,
    itemsPerPage: limit,
    totalPages: Math.ceil(totalItems / limit),
  };
}
