import { BadRequestException, Injectable } from '@nestjs/common';
import { EDITION_READ_ONLY } from '../editions/active-edition';
import {
  isWritable,
  resolveEdition,
  toEditionSummary,
} from '../juror-edition/edition-resolver';
import { EditionSummary } from '../juror-edition/juror-edition.types';
import { PrismaService } from '../prisma/prisma.service';
import { SaveFairScheduleDto } from './dto/save-fair-schedule.dto';
import {
  DEFAULT_FAIR_TIMES,
  FairScheduleValues,
  scheduleProblem,
} from './fair-schedule';

export interface FairScheduleResponse {
  edition: EditionSummary;
  /** `false` mientras no se guarde: las horas son las de P-09 y no hay fecha. */
  configured: boolean;
  schedule: FairScheduleValues;
}

const scheduleSelect = {
  fairDate: true,
  startTime: true,
  alertTime: true,
  controlTime: true,
  closeTime: true,
} as const;

/** HU-12: cronograma de la feria por edición. Escribir es solo del Administrador. */
@Injectable()
export class FairScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /** El cronograma de la edición, o las horas por defecto sin fecha si no se ha configurado. */
  async findForEdition(editionId: number): Promise<FairScheduleValues> {
    const row = await this.prisma.fairSchedule.findUnique({
      where: { editionId },
      select: scheduleSelect,
    });
    if (!row) return { ...DEFAULT_FAIR_TIMES, fairDate: null };
    return { ...row, fairDate: row.fairDate.toISOString().slice(0, 10) };
  }

  async get(editionId?: number): Promise<FairScheduleResponse> {
    const edition = await resolveEdition(this.prisma, editionId);
    const schedule = await this.findForEdition(edition.id);
    return {
      edition: toEditionSummary(edition),
      configured: schedule.fairDate !== null,
      schedule,
    };
  }

  /** Crea o reemplaza el cronograma. 400 si la edición es de solo lectura o las horas no cuadran. */
  async save(
    dto: SaveFairScheduleDto,
    updatedById: string,
  ): Promise<FairScheduleResponse> {
    const problem = scheduleProblem(dto);
    if (problem) throw new BadRequestException(problem);

    const edition = await resolveEdition(this.prisma, dto.editionId);
    if (!isWritable(edition)) {
      throw new BadRequestException({
        statusCode: 400,
        code: EDITION_READ_ONLY,
        message: `El cronograma de «${edition.title}» es de solo lectura: la edición está archivada o ya terminó`,
      });
    }

    const values = {
      fairDate: new Date(`${dto.fairDate}T00:00:00.000Z`),
      startTime: dto.startTime,
      alertTime: dto.alertTime,
      controlTime: dto.controlTime,
      closeTime: dto.closeTime,
      updatedById,
    };
    await this.prisma.fairSchedule.upsert({
      where: { editionId: edition.id },
      create: { editionId: edition.id, ...values },
      update: values,
    });

    return {
      edition: toEditionSummary(edition),
      configured: true,
      schedule: {
        fairDate: dto.fairDate,
        startTime: dto.startTime,
        alertTime: dto.alertTime,
        controlTime: dto.controlTime,
        closeTime: dto.closeTime,
      },
    };
  }
}
