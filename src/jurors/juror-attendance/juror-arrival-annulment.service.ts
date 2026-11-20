import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertEditionWritable } from 'src/editions/active-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnnulledArrival, PersonRef } from './juror-attendance.types';

/** 404: no hay una llegada con ese id. */
export const ATTENDANCE_NOT_FOUND = 'ATTENDANCE_NOT_FOUND';
/** 409: la llegada ya estaba anulada (otra persona la anuló antes o es un doble clic). */
export const ARRIVAL_ALREADY_ANNULLED = 'ARRIVAL_ALREADY_ANNULLED';

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const annulledSelect = {
  id: true,
  checkedInAt: true,
  method: true,
  annulledAt: true,
  annulmentReason: true,
  edition: { select: { id: true, title: true } },
  juror: { select: personSelect },
  checkedInBy: { select: personSelect },
  annulledBy: { select: personSelect },
} satisfies Prisma.JurorAttendanceSelect;

type AnnulledRow = Prisma.JurorAttendanceGetPayload<{
  select: typeof annulledSelect;
}>;

function toPerson(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
}): PersonRef {
  return {
    id: user.id,
    name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
  };
}

/**
 * BG-49 (ARK-251): el Administrador anula una llegada registrada por error.
 *
 * Borrado lógico: la fila queda con `isActive = false` y quién la anuló, cuándo y el motivo.
 * No hay nada que recalcular aparte: la asistencia (HU-29), la alerta de inasistencia (HU-12), la
 * presencia (HU-23), la contingencia de suplentes (HU-14), el alta de último momento (HU-24) y los
 * recordatorios push (HU-37) leen solo las llegadas activas en cada consulta, así que el jurado
 * vuelve a «Sin check-in» en todas ellas. El índice único parcial (solo activas) permite registrar
 * su llegada otra vez.
 */
@Injectable()
export class JurorArrivalAnnulmentService {
  constructor(private readonly prisma: PrismaService) {}

  async annul(
    attendanceId: number,
    adminId: string,
    reason?: string,
  ): Promise<AnnulledArrival> {
    const attendance = await this.prisma.jurorAttendance.findUnique({
      where: { id: attendanceId },
      select: {
        isActive: true,
        edition: { select: { status: true, title: true } },
      },
    });
    if (!attendance) {
      throw new NotFoundException({
        statusCode: 404,
        code: ATTENDANCE_NOT_FOUND,
        message: 'No existe una llegada registrada con ese id.',
      });
    }
    // Las llegadas de ediciones anteriores son historial (400 EDITION_READ_ONLY).
    assertEditionWritable(attendance.edition, 'la llegada del jurado');
    if (!attendance.isActive) throw this.alreadyAnnulled();

    // Condición en el UPDATE: si dos administradores anulan a la vez, solo uno gana.
    const { count } = await this.prisma.jurorAttendance.updateMany({
      where: { id: attendanceId, isActive: true },
      data: {
        isActive: false,
        annulledAt: new Date(),
        annulledById: adminId,
        annulmentReason: reason ?? null,
      },
    });
    if (count === 0) throw this.alreadyAnnulled();

    const row = await this.prisma.jurorAttendance.findUniqueOrThrow({
      where: { id: attendanceId },
      select: annulledSelect,
    });
    return this.toResponse(row);
  }

  private alreadyAnnulled(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: ARRIVAL_ALREADY_ANNULLED,
      message: 'Esta llegada ya estaba anulada.',
    });
  }

  private toResponse(row: AnnulledRow): AnnulledArrival {
    return {
      attendanceId: row.id,
      edition: { id: row.edition.id, title: row.edition.title },
      juror: toPerson(row.juror),
      checkedInAt: row.checkedInAt,
      method: row.method,
      checkedInBy: toPerson(row.checkedInBy),
      // Recién escritos en el UPDATE de arriba: no pueden ser null.
      annulledAt: row.annulledAt as Date,
      annulledBy: toPerson(row.annulledBy!),
      annulmentReason: row.annulmentReason,
      jurorStatus: 'MISSING',
    };
  }
}
