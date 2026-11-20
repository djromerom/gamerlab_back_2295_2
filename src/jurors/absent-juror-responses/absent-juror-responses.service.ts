import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AbsentJurorResponseResult, Prisma } from '@prisma/client';
import { requireActiveEdition } from 'src/editions/active-edition';
import {
  jurorCategoryLabel,
  jurorFullName,
  jurorSelect,
} from 'src/jurors/juror-badges/juror-label';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAbsentJurorResponseDto } from './dto/create-absent-juror-response.dto';

/** Código del 409 cuando el jurado ya tiene su llegada registrada. */
export const JUROR_ALREADY_CHECKED_IN = 'JUROR_ALREADY_CHECKED_IN';

const responseSelect = {
  id: true,
  jurorId: true,
  result: true,
  estimatedArrivalAt: true,
  recordedAt: true,
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AbsentJurorResponseSelect;

type ResponseRow = Prisma.AbsentJurorResponseGetPayload<{
  select: typeof responseSelect;
}>;

function toResponseItem({ recordedBy, ...row }: ResponseRow) {
  return {
    ...row,
    recordedBy: {
      id: recordedBy.id,
      name: `${recordedBy.firstName ?? ''} ${recordedBy.lastName ?? ''}`.trim(),
    },
  };
}

/** Hora estimada como `Date`; 400 si no aplica al resultado o si la fecha no existe. */
function parseEstimatedArrival(
  dto: CreateAbsentJurorResponseDto,
): Date | undefined {
  if (!dto.estimatedArrivalAt) return undefined;
  if (dto.result !== AbsentJurorResponseResult.ON_THE_WAY) {
    throw new BadRequestException(
      'La hora estimada solo aplica cuando el jurado viene en camino',
    );
  }
  const estimatedArrivalAt = new Date(dto.estimatedArrivalAt);
  if (Number.isNaN(estimatedArrivalAt.getTime())) {
    throw new BadRequestException('La hora estimada no es una fecha válida');
  }
  return estimatedArrivalAt;
}

/**
 * HU-13: el administrador registra lo que los profesores averiguan de los jurados que no llegaron.
 * Cada registro es una fila nueva con hora y autor. Es informativo: este servicio no toca
 * asignaciones ni asistencia, así que no cambia las reglas de cobertura (HU-14).
 */
@Injectable()
export class AbsentJurorResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAbsentJurorResponseDto, recordedById: string) {
    const estimatedArrivalAt = parseEstimatedArrival(dto);
    const edition = await requireActiveEdition(this.prisma);

    const juror = await this.prisma.user.findFirst({
      where: jurorsOfEdition(edition.id, [dto.jurorId]),
      select: { id: true },
    });
    if (!juror) {
      throw new NotFoundException(
        'El jurado no existe o no pertenece a la edición activa',
      );
    }

    // CU-13: solo se registra sobre quien no ha llegado. La hora de la alerta es de HU-12.
    const attendance = await this.prisma.jurorAttendance.findFirst({
      where: { jurorId: juror.id, editionId: edition.id, isActive: true },
      select: { id: true },
    });
    if (attendance) {
      throw new ConflictException({
        statusCode: 409,
        code: JUROR_ALREADY_CHECKED_IN,
        message: 'El jurado ya tiene registrada su llegada a la feria',
      });
    }

    const created = await this.prisma.absentJurorResponse.create({
      data: {
        jurorId: juror.id,
        editionId: edition.id,
        result: dto.result,
        estimatedArrivalAt,
        recordedById,
      },
      select: responseSelect,
    });
    return toResponseItem(created);
  }

  /**
   * Historial de la edición activa, el más reciente primero. También responde por quien ya tiene
   * registros y dejó de ser jurado de la edición (por ejemplo, Declinó): la constancia se conserva.
   */
  async history(jurorId: string) {
    const edition = await requireActiveEdition(this.prisma);

    const juror = await this.prisma.user.findFirst({
      where: {
        OR: [
          jurorsOfEdition(edition.id, [jurorId]),
          {
            id: jurorId,
            absentResponses: { some: { editionId: edition.id } },
          },
        ],
      },
      select: jurorSelect,
    });
    if (!juror) {
      throw new NotFoundException(
        'El jurado no existe o no pertenece a la edición activa',
      );
    }

    const responses = await this.prisma.absentJurorResponse.findMany({
      where: { jurorId: juror.id, editionId: edition.id },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: responseSelect,
    });

    return {
      edition: { id: edition.id, title: edition.title },
      juror: {
        id: juror.id,
        name: jurorFullName(juror),
        category: jurorCategoryLabel(juror),
      },
      data: responses.map(toResponseItem),
    };
  }
}
