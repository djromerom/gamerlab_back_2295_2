import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveFairScheduleDto } from './dto/save-fair-schedule.dto';
import { FairScheduleService } from './fair-schedule.service';

const FUTURE = new Date('2099-01-01T00:00:00.000Z');
const PAST = new Date('2000-01-01T00:00:00.000Z');
const edition = (status: EditionStatus, endsAt: Date = FUTURE) => ({
  id: 5,
  title: 'ARKAD 2026-30',
  status,
  year: 2026,
  semester: 30,
  endsAt,
});

const dto: SaveFairScheduleDto = {
  fairDate: '2026-11-26',
  startTime: '08:00',
  alertTime: '10:00',
  controlTime: '11:00',
  closeTime: '12:00',
};

describe('FairScheduleService', () => {
  const prisma = {
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    fairSchedule: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  let service: FairScheduleService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(edition(EditionStatus.ACTIVE));
    service = new FairScheduleService(prisma as unknown as PrismaService);
  });

  it('sin cronograma devuelve las horas de P-09 sin fecha', async () => {
    prisma.fairSchedule.findUnique.mockResolvedValue(null);

    const result = await service.get();

    expect(result.configured).toBe(false);
    expect(result.schedule).toEqual({ ...dto, fairDate: null });
    expect(result.edition.writable).toBe(true);
  });

  it('devuelve la fecha guardada como YYYY-MM-DD', async () => {
    prisma.fairSchedule.findUnique.mockResolvedValue({
      ...dto,
      fairDate: new Date('2026-11-26T00:00:00.000Z'),
    });

    const result = await service.get();

    expect(result.configured).toBe(true);
    expect(result.schedule).toEqual(dto);
  });

  it('404 si la edición pedida no existe', async () => {
    prisma.edition.findUnique.mockResolvedValue(null);
    await expect(service.get(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('guarda en la edición activa con quién lo cambió', async () => {
    const result = await service.save(dto, 'admin-1');

    expect(prisma.fairSchedule.upsert).toHaveBeenCalledWith({
      where: { editionId: 5 },
      create: {
        editionId: 5,
        ...dto,
        fairDate: new Date('2026-11-26T00:00:00.000Z'),
        updatedById: 'admin-1',
      },
      update: {
        ...dto,
        fairDate: new Date('2026-11-26T00:00:00.000Z'),
        updatedById: 'admin-1',
      },
    });
    expect(result).toMatchObject({ configured: true, schedule: dto });
  });

  it('acepta una edición INACTIVE que aún no termina', async () => {
    prisma.edition.findUnique.mockResolvedValue(
      edition(EditionStatus.INACTIVE),
    );

    await service.save({ ...dto, editionId: 5 }, 'admin-1');

    expect(prisma.fairSchedule.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['archivada', edition(EditionStatus.ARCHIVED)],
    ['inactiva y terminada', edition(EditionStatus.INACTIVE, PAST)],
  ])('400 EDITION_READ_ONLY en una edición %s', async (_name, row) => {
    prisma.edition.findUnique.mockResolvedValue(row);

    await expect(
      service.save({ ...dto, editionId: 5 }, 'admin-1'),
    ).rejects.toMatchObject({
      response: { code: 'EDITION_READ_ONLY' },
    });
    expect(prisma.fairSchedule.upsert).not.toHaveBeenCalled();
  });

  it('400 si las horas no van en orden, sin consultar la edición', async () => {
    await expect(
      service.save({ ...dto, alertTime: '11:30' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.edition.findFirst).not.toHaveBeenCalled();
    expect(prisma.fairSchedule.upsert).not.toHaveBeenCalled();
  });
});
