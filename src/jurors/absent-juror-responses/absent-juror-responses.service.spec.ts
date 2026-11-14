import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AbsentJurorResponseResult } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { AbsentJurorResponsesController } from './absent-juror-responses.controller';
import {
  AbsentJurorResponsesService,
  JUROR_ALREADY_CHECKED_IN,
} from './absent-juror-responses.service';
import { CreateAbsentJurorResponseDto } from './dto/create-absent-juror-response.dto';

const EDITION = { id: 5, title: 'ARKAD 2026-30' };
const RECORDED_AT = new Date('2026-11-26T15:02:41.000Z');
const ETA = '2026-11-26T15:30:00.000Z';

const row = (extra: object = {}) => ({
  id: 12,
  jurorId: 'juror-1',
  result: AbsentJurorResponseResult.NO_RESPONSE,
  estimatedArrivalAt: null,
  recordedAt: RECORDED_AT,
  recordedBy: { id: 'admin-1', firstName: 'Admin', lastName: 'Arkad' },
  ...extra,
});

const callArg = <T>(mock: jest.Mock): T =>
  (mock.mock.calls as unknown[][])[0][0] as T;

describe('AbsentJurorResponsesService', () => {
  let service: AbsentJurorResponsesService;
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    jurorAttendance: { findFirst: jest.fn() },
    absentJurorResponse: { create: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(EDITION);
    prisma.user.findFirst.mockResolvedValue({ id: 'juror-1' });
    prisma.jurorAttendance.findFirst.mockResolvedValue(null);
    prisma.absentJurorResponse.create.mockResolvedValue(row());
    const moduleRef = await Test.createTestingModule({
      providers: [
        AbsentJurorResponsesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AbsentJurorResponsesService);
  });

  describe('create', () => {
    it('guarda el resultado con edición y autor, y responde quién lo registró', async () => {
      const result = await service.create(
        { jurorId: 'juror-1', result: AbsentJurorResponseResult.NO_RESPONSE },
        'admin-1',
      );

      expect(
        callArg<{ data: unknown }>(prisma.absentJurorResponse.create).data,
      ).toEqual({
        jurorId: 'juror-1',
        editionId: EDITION.id,
        result: AbsentJurorResponseResult.NO_RESPONSE,
        estimatedArrivalAt: undefined,
        recordedById: 'admin-1',
      });
      expect(result.recordedAt).toEqual(RECORDED_AT);
      expect(result.recordedBy).toEqual({ id: 'admin-1', name: 'Admin Arkad' });
    });

    it('guarda la hora estimada cuando viene en camino', async () => {
      await service.create(
        {
          jurorId: 'juror-1',
          result: AbsentJurorResponseResult.ON_THE_WAY,
          estimatedArrivalAt: ETA,
        },
        'admin-1',
      );

      expect(
        callArg<{ data: { estimatedArrivalAt: Date } }>(
          prisma.absentJurorResponse.create,
        ).data.estimatedArrivalAt,
      ).toEqual(new Date(ETA));
    });

    it('la hora estimada es opcional cuando viene en camino', async () => {
      await expect(
        service.create(
          { jurorId: 'juror-1', result: AbsentJurorResponseResult.ON_THE_WAY },
          'admin-1',
        ),
      ).resolves.toBeDefined();
    });

    it.each([
      AbsentJurorResponseResult.CANNOT_ATTEND,
      AbsentJurorResponseResult.NO_RESPONSE,
    ])('rechaza la hora estimada con %s', async (result) => {
      await expect(
        service.create(
          { jurorId: 'juror-1', result, estimatedArrivalAt: ETA },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.absentJurorResponse.create).not.toHaveBeenCalled();
    });

    it('rechaza una hora estimada que no es una fecha real', async () => {
      await expect(
        service.create(
          {
            jurorId: 'juror-1',
            result: AbsentJurorResponseResult.ON_THE_WAY,
            estimatedArrivalAt: '2026-13-01T10:00:00Z',
          },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('valida al jurado con jurorsOfEdition de la edición activa', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { jurorId: 'otro', result: AbsentJurorResponseResult.NO_RESPONSE },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(callArg<{ where: unknown }>(prisma.user.findFirst).where).toEqual(
        jurorsOfEdition(EDITION.id, ['otro']),
      );
      expect(prisma.absentJurorResponse.create).not.toHaveBeenCalled();
    });

    it('responde 409 si el jurado ya llegó, y solo mira la llegada activa de esta edición', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({ id: 3 });

      const attempt = service.create(
        { jurorId: 'juror-1', result: AbsentJurorResponseResult.ON_THE_WAY },
        'admin-1',
      );

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({
        response: { code: JUROR_ALREADY_CHECKED_IN },
      });
      expect(
        callArg<{ where: unknown }>(prisma.jurorAttendance.findFirst).where,
      ).toEqual({ jurorId: 'juror-1', editionId: EDITION.id, isActive: true });
      expect(prisma.absentJurorResponse.create).not.toHaveBeenCalled();
    });

    it('responde 404 si no hay edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { jurorId: 'juror-1', result: AbsentJurorResponseResult.NO_RESPONSE },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('history', () => {
    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'juror-1',
        firstName: 'Ana',
        lastName: 'Pérez',
        jurorCategory: null,
        role: { name: 'Profesor' },
      });
    });

    it('devuelve el historial de la edición activa, el más reciente primero', async () => {
      prisma.absentJurorResponse.findMany.mockResolvedValue([
        row({ id: 13, result: AbsentJurorResponseResult.CANNOT_ATTEND }),
        row(),
      ]);

      const result = await service.history('juror-1');

      const args = callArg<{ where: unknown; orderBy: unknown }>(
        prisma.absentJurorResponse.findMany,
      );
      expect(args.where).toEqual({ jurorId: 'juror-1', editionId: EDITION.id });
      expect(args.orderBy).toEqual([{ recordedAt: 'desc' }, { id: 'desc' }]);
      expect(result.edition).toEqual(EDITION);
      expect(result.juror).toEqual({
        id: 'juror-1',
        name: 'Ana Pérez',
        category: 'Senior',
      });
      expect(result.data.map((item) => item.id)).toEqual([13, 12]);
      expect(result.data[0].recordedBy.name).toBe('Admin Arkad');
    });

    it('devuelve data vacía para un jurado de la edición sin registros', async () => {
      prisma.absentJurorResponse.findMany.mockResolvedValue([]);

      await expect(service.history('juror-1')).resolves.toMatchObject({
        data: [],
      });
    });

    it('conserva el historial de quien dejó de ser jurado de la edición', async () => {
      prisma.absentJurorResponse.findMany.mockResolvedValue([row()]);

      await service.history('juror-1');

      expect(callArg<{ where: unknown }>(prisma.user.findFirst).where).toEqual({
        OR: [
          jurorsOfEdition(EDITION.id, ['juror-1']),
          {
            id: 'juror-1',
            absentResponses: { some: { editionId: EDITION.id } },
          },
        ],
      });
    });

    it('responde 404 si no es jurado de la edición ni tiene registros', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.history('otro')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.absentJurorResponse.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('CreateAbsentJurorResponseDto', () => {
  const errorsOf = async (body: object) =>
    (await validate(plainToInstance(CreateAbsentJurorResponseDto, body))).map(
      (error) => error.property,
    );

  it('acepta los tres resultados del ticket', async () => {
    for (const result of ['ON_THE_WAY', 'CANNOT_ATTEND', 'NO_RESPONSE']) {
      expect(await errorsOf({ jurorId: 'juror-1', result })).toEqual([]);
    }
  });

  it('rechaza un resultado desconocido y un jurado vacío', async () => {
    expect(await errorsOf({ jurorId: '', result: 'LLEGO' })).toEqual([
      'jurorId',
      'result',
    ]);
  });

  it('exige la zona horaria en la hora estimada', async () => {
    const body = { jurorId: 'juror-1', result: 'ON_THE_WAY' };
    expect(
      await errorsOf({ ...body, estimatedArrivalAt: '2026-11-26T10:30:00' }),
    ).toEqual(['estimatedArrivalAt']);
    expect(
      await errorsOf({
        ...body,
        estimatedArrivalAt: '2026-11-26T10:30:00-05:00',
      }),
    ).toEqual([]);
  });
});

describe('AbsentJurorResponsesController', () => {
  it('exige el guard y el servicio ManageAbsentJurorResponses', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      AbsentJurorResponsesController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
    expect(
      Reflect.getMetadata(REQUIRED_SERVICE_KEY, AbsentJurorResponsesController),
    ).toBe('ManageAbsentJurorResponses');
  });
});
