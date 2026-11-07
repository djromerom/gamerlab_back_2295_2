import { Injectable } from '@nestjs/common';
import { requireActiveEdition } from '../editions/active-edition';
import {
  PROFESSOR_ROLE_NAME,
  jurorCategoryLabel,
  jurorFullName,
  jurorSelect,
} from '../juror-badges/juror-label';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import { PrismaService } from '../prisma/prisma.service';
import { buildAttendancePage } from './attendance-page';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { AttendanceRow } from './juror-attendance.types';

/**
 * HU-29: asistencia de los jurados de la edición activa. Solo lectura.
 * Quién es jurado lo decide `jurorsOfEdition` (HU-25); un registro de llegada de alguien que ya
 * no es de la edición no aparece ni cuenta en los totales.
 */
@Injectable()
export class JurorAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAttendanceQueryDto) {
    const edition = await requireActiveEdition(this.prisma);
    const rows = await this.rowsOfEdition(edition.id);

    return {
      edition: { id: edition.id, title: edition.title },
      ...buildAttendancePage(rows, query),
    };
  }

  /** Una fila por cada jurado de la edición con su asistencia en ella (también la usa HU-12). */
  async rowsOfEdition(editionId: number): Promise<AttendanceRow[]> {
    const jurors = await this.prisma.user.findMany({
      where: jurorsOfEdition(editionId),
      select: {
        ...jurorSelect,
        jurorBadges: {
          where: { editionId, isActive: true },
          select: { id: true },
          take: 1,
        },
        attendances: {
          where: { editionId, isActive: true },
          select: {
            checkedInAt: true,
            method: true,
            checkedInBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          take: 1,
        },
      },
    });

    return jurors.map((juror) => {
      const attendance = juror.attendances[0];
      return {
        firstName: juror.firstName ?? '',
        lastName: juror.lastName ?? '',
        item: {
          jurorId: juror.id,
          name: jurorFullName(juror),
          category: jurorCategoryLabel(juror),
          isProfessor: juror.role.name === PROFESSOR_ROLE_NAME,
          hasBadge: juror.jurorBadges.length > 0,
          status: attendance ? 'PRESENT' : 'MISSING',
          checkedInAt: attendance?.checkedInAt ?? null,
          method: attendance?.method ?? null,
          checkedInBy: attendance
            ? {
                id: attendance.checkedInBy.id,
                name: `${attendance.checkedInBy.firstName ?? ''} ${attendance.checkedInBy.lastName ?? ''}`.trim(),
              }
            : null,
        },
      };
    });
  }
}
