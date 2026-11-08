import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationTrackingService } from './evaluation-tracking.service';

const DAY = '2026-11-26';
const at = (local: string) => new Date(`${DAY}T${local}-05:00`);

const team = (
  id: number,
  teamCode: string,
  jurorIds: string[],
  videogameId: number | null = id * 10,
) => ({
  id,
  teamCode,
  teamName: `Equipo ${id}`,
  videogame: videogameId ? { id: videogameId, name: `Juego ${id}` } : null,
  assignedJurors: jurorIds.map((jid) => ({ id: jid })),
});

const whereOf = (mock: jest.Mock): Record<string, unknown> =>
  (mock.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

describe('EvaluationTrackingService (HU-21)', () => {
  let service: EvaluationTrackingService;
  const prisma = {
    edition: { findFirst: jest.fn() },
    team: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
    jurorAttendance: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue({ id: 12 });
    prisma.evaluation.findMany.mockResolvedValue([]);
    prisma.jurorAttendance.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationTrackingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(EvaluationTrackingService);
  });

  it('cuenta asignados, presentes (solo asignados), recibidas y las que cuentan', async () => {
    prisma.team.findMany.mockResolvedValue([
      team(1, 'N2-AYP-01', ['a', 'b', 'c', 'd']),
    ]);
    prisma.jurorAttendance.findMany.mockResolvedValue([
      { jurorId: 'a' },
      { jurorId: 'c' },
    ]);
    prisma.evaluation.findMany.mockResolvedValue(
      ['08:45:00', '09:30:00', '10:05:00', '10:50:00'].map((t) => ({
        videogameId: 10,
        date: at(t),
      })),
    );

    const result = await service.getTracking({ date: DAY });

    expect(result.editionId).toBe(12);
    expect(result.hours).toEqual([8, 9, 10, 11, 12]);
    expect(result.groups[0]).toMatchObject({
      teamId: 1,
      level: 'N2',
      assignedJurors: 4,
      presentJurors: 2,
      evaluationsReceived: 4,
      evaluationsCounted: 3,
      belowMinimumAt11: false,
    });
    expect(result.groups[0].byHour.map((b) => b.received)).toEqual([
      0, 1, 2, 4, 4,
    ]);
    // La asistencia se consulta en la edición activa y solo para jurados asignados.
    expect(prisma.jurorAttendance.findMany).toHaveBeenCalledWith({
      where: {
        editionId: 12,
        isActive: true,
        jurorId: { in: ['a', 'b', 'c', 'd'] },
      },
      select: { jurorId: true },
    });
  });

  it('lee solo evaluaciones activas de la edición activa', async () => {
    prisma.team.findMany.mockResolvedValue([team(1, 'N1-X-01', [])]);
    await service.getTracking({ date: DAY });
    expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { editionId: 12, isActive: true, videogameId: { in: [10] } },
      }),
    );
    expect(whereOf(prisma.team.findMany)).toMatchObject({
      videogame: { is: { videogameStatus: { status: 'CONFIRMADO' } } },
    });
    expect(whereOf(prisma.team.findMany)).toMatchObject({
      editionId: 12,
      isActive: true,
    });
  });

  it('filtra por nivel y ordena de menos a más evaluaciones que cuentan', async () => {
    prisma.team.findMany.mockResolvedValue([
      team(1, 'N2-A-01', []),
      team(2, 'N3-B-01', []),
      team(3, 'N2-A-02', []),
    ]);
    prisma.evaluation.findMany.mockResolvedValue([
      { videogameId: 10, date: at('09:00:00') },
      { videogameId: 10, date: at('09:10:00') },
    ]);

    const result = await service.getTracking({ date: DAY, level: 'N2' });

    expect(result.groups.map((g) => g.teamId)).toEqual([3, 1]);
    expect(whereOf(prisma.evaluation.findMany)).toMatchObject({
      videogameId: { in: [10, 30] },
    });
  });

  it('un grupo sin evaluaciones queda en cero y resaltado a las 11:00', async () => {
    prisma.team.findMany.mockResolvedValue([team(1, 'N0-COL-01', ['a'])]);
    const [group] = (await service.getTracking({ date: DAY })).groups;
    expect(group.evaluationsReceived).toBe(0);
    expect(group.byHour.every((b) => b.received === 0)).toBe(true);
    expect(group.belowMinimumAt11).toBe(true);
  });

  it('sin grupos no consulta evaluaciones ni asistencia', async () => {
    prisma.team.findMany.mockResolvedValue([]);
    const result = await service.getTracking({ date: DAY });
    expect(result.groups).toEqual([]);
    expect(prisma.evaluation.findMany).not.toHaveBeenCalled();
    expect(prisma.jurorAttendance.findMany).not.toHaveBeenCalled();
  });

  it('no devuelve datos personales de los jurados', async () => {
    prisma.team.findMany.mockResolvedValue([team(1, 'N1-X-01', ['a'])]);
    const result = await service.getTracking({ date: DAY });
    expect(JSON.stringify(result)).not.toMatch(/email|"a"/);
  });

  it('404 si no hay edición activa', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(service.getTracking({ date: DAY })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('400 si la fecha no existe', async () => {
    await expect(
      service.getTracking({ date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });
});
