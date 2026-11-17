import { NotFoundException, RequestMethod } from '@nestjs/common';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { JurorBadgesService } from 'src/jurors/juror-badges/juror-badges.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ScanBadgeDto } from './dto/juror-checkin.dto';
import { JurorCheckinController } from './juror-checkin.controller';
import { JurorCheckinService } from './juror-checkin.service';

jest.setTimeout(30000);

const JUROR_ID = '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01';
const STAFF_ID = 'staff-1';
const FIRST_ARRIVAL = new Date('2026-11-26T13:05:00.000Z');

/** Primer argumento de una llamada a un mock, tipado. */
const callArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as unknown[][])[call][0] as T;

const jurorWithTeams = {
  id: JUROR_ID,
  firstName: 'Ana',
  lastName: 'Pérez',
  jurorCategory: null,
  role: { name: 'Profesor' },
  teamsToEvaluate: [{ id: 4, teamName: 'Pixel Pioneers' }],
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('duplicado', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('JurorCheckinService', () => {
  let service: JurorCheckinService;
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    jurorAttendance: { findFirst: jest.fn(), create: jest.fn() },
  };
  const badges = { validateToken: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue({ id: 3 });
    prisma.user.findUniqueOrThrow.mockResolvedValue(jurorWithTeams);
    badges.validateToken.mockResolvedValue({
      badgeId: 10,
      jurorId: JUROR_ID,
      editionId: 3,
      name: 'Ana Pérez',
      category: 'Senior',
    });
    const module = await Test.createTestingModule({
      providers: [
        JurorCheckinService,
        { provide: PrismaService, useValue: prisma },
        { provide: JurorBadgesService, useValue: badges },
      ],
    }).compile();
    service = module.get(JurorCheckinService);
  });

  describe('checkInByToken', () => {
    it('registra la llegada y devuelve nombre, categoría y grupos sin correo', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      prisma.jurorAttendance.create.mockResolvedValue({
        checkedInAt: FIRST_ARRIVAL,
        method: 'QR',
      });

      const result = await service.checkInByToken('token-ok', STAFF_ID);

      expect(
        callArg<{ data: unknown }>(prisma.jurorAttendance.create).data,
      ).toEqual({
        jurorId: JUROR_ID,
        editionId: 3,
        checkedInById: STAFF_ID,
        method: 'QR',
        badgeId: 10,
      });
      expect(result).toEqual({
        status: 'CHECKED_IN',
        checkedInAt: FIRST_ARRIVAL,
        method: 'QR',
        juror: {
          id: JUROR_ID,
          name: 'Ana Pérez',
          category: 'Senior',
          teams: [{ id: 4, name: 'Pixel Pioneers' }],
        },
      });
      expect(JSON.stringify(result)).not.toContain('@');
    });

    it('solo muestra los grupos activos de la edición del registro', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      prisma.jurorAttendance.create.mockResolvedValue({
        checkedInAt: FIRST_ARRIVAL,
        method: 'QR',
      });

      await service.checkInByToken('token-ok', STAFF_ID);

      const query = callArg<{
        select: { teamsToEvaluate: { where: unknown } };
      }>(prisma.user.findUniqueOrThrow);
      expect(query.select.teamsToEvaluate.where).toEqual({
        editionId: 3,
        isActive: true,
        videogame: { is: { videogameStatus: { status: 'CONFIRMADO' } } },
        notGradable: false, // HU-39 (ARK-209)
      });
    });

    it('un segundo escaneo no crea otro registro y avisa con la hora original', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({
        checkedInAt: FIRST_ARRIVAL,
        method: 'MANUAL',
      });

      const result = await service.checkInByToken('token-ok', STAFF_ID);

      expect(prisma.jurorAttendance.create).not.toHaveBeenCalled();
      expect(result.status).toBe('ALREADY_CHECKED_IN');
      expect(result.checkedInAt).toBe(FIRST_ARRIVAL);
      expect(result.method).toBe('MANUAL');
    });

    it('dos escaneos simultáneos: el que pierde la carrera responde ALREADY_CHECKED_IN', async () => {
      prisma.jurorAttendance.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ checkedInAt: FIRST_ARRIVAL, method: 'QR' });
      prisma.jurorAttendance.create.mockRejectedValue(uniqueViolation());

      const result = await service.checkInByToken('token-ok', STAFF_ID);

      expect(result.status).toBe('ALREADY_CHECKED_IN');
      expect(result.checkedInAt).toBe(FIRST_ARRIVAL);
    });

    it('propaga otros errores de la base de datos', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      prisma.jurorAttendance.create.mockRejectedValue(new Error('caída'));

      await expect(
        service.checkInByToken('token-ok', STAFF_ID),
      ).rejects.toThrow('caída');
    });

    it('un QR inválido o de otra edición responde 404 sin registrar', async () => {
      badges.validateToken.mockRejectedValue(
        new NotFoundException('Código QR no válido o de otra edición'),
      );

      await expect(
        service.checkInByToken('viejo', STAFF_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.jurorAttendance.create).not.toHaveBeenCalled();
    });
  });

  describe('previewBadge (BG-49)', () => {
    it('devuelve nombre, categoría y grupos sin registrar la llegada', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);

      const result = await service.previewBadge('token-ok');

      expect(badges.validateToken).toHaveBeenCalledWith('token-ok');
      expect(result).toEqual({
        juror: {
          id: JUROR_ID,
          name: 'Ana Pérez',
          category: 'Senior',
          teams: [{ id: 4, name: 'Pixel Pioneers' }],
        },
        checkedInAt: null,
      });
      expect(JSON.stringify(result)).not.toContain('@');
      expect(prisma.jurorAttendance.create).not.toHaveBeenCalled();
    });

    it('con llegada activa devuelve su hora', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({
        checkedInAt: FIRST_ARRIVAL,
        method: 'QR',
      });

      const result = await service.previewBadge('token-ok');

      expect(result.checkedInAt).toBe(FIRST_ARRIVAL);
      expect(prisma.jurorAttendance.create).not.toHaveBeenCalled();
    });

    it('solo mira la llegada activa de la edición del QR (una anulada no cuenta)', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);

      await service.previewBadge('token-ok');

      expect(
        callArg<{ where: unknown }>(prisma.jurorAttendance.findFirst).where,
      ).toEqual({ jurorId: JUROR_ID, editionId: 3, isActive: true });
    });

    it('un QR inválido o de otra edición responde 404', async () => {
      badges.validateToken.mockRejectedValue(
        new NotFoundException('Código QR no válido o de otra edición'),
      );

      await expect(service.previewBadge('viejo')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('checkInManually', () => {
    it('registra a un jurado sin escarapela (badgeId null)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: JUROR_ID,
        jurorBadges: [],
      });
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      prisma.jurorAttendance.create.mockResolvedValue({
        checkedInAt: FIRST_ARRIVAL,
        method: 'MANUAL',
      });

      const result = await service.checkInManually(JUROR_ID, STAFF_ID);

      expect(
        callArg<{ data: unknown }>(prisma.jurorAttendance.create).data,
      ).toEqual({
        jurorId: JUROR_ID,
        editionId: 3,
        checkedInById: STAFF_ID,
        method: 'MANUAL',
        badgeId: null,
      });
      expect(result.status).toBe('CHECKED_IN');
    });

    it('enlaza la escarapela activa si el jurado la tiene', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: JUROR_ID,
        jurorBadges: [{ id: 10 }],
      });
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      prisma.jurorAttendance.create.mockResolvedValue({
        checkedInAt: FIRST_ARRIVAL,
        method: 'MANUAL',
      });

      await service.checkInManually(JUROR_ID, STAFF_ID);

      expect(
        callArg<{ data: { badgeId: number } }>(prisma.jurorAttendance.create)
          .data.badgeId,
      ).toBe(10);
    });

    it('quien no es jurado de la edición activa responde 404 (BG-16)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.checkInManually(JUROR_ID, STAFF_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      const where = callArg<{ where: Record<string, unknown> }>(
        prisma.user.findFirst,
      ).where;
      expect(where).toEqual(jurorsOfEdition(3, [JUROR_ID]));
      expect(prisma.jurorAttendance.create).not.toHaveBeenCalled();
    });

    it('sin edición activa responde 404', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(
        service.checkInManually(JUROR_ID, STAFF_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('search', () => {
    it('incluye jurados con y sin escarapela y su hora de llegada', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'a',
          firstName: 'Ana',
          lastName: 'Pérez',
          jurorCategory: 'JUNIOR',
          role: { name: 'Jurado' },
          jurorBadges: [{ id: 10 }],
          attendances: [{ checkedInAt: FIRST_ARRIVAL }],
        },
        {
          id: 'b',
          firstName: 'Andrés',
          lastName: 'Gómez',
          jurorCategory: null,
          role: { name: 'Profesor' },
          jurorBadges: [],
          attendances: [],
        },
      ]);

      const result = await service.search('an');

      expect(result).toEqual([
        {
          id: 'a',
          name: 'Ana Pérez',
          category: 'Junior',
          hasBadge: true,
          checkedInAt: FIRST_ARRIVAL,
        },
        {
          id: 'b',
          name: 'Andrés Gómez',
          category: 'Senior',
          hasBadge: false,
          checkedInAt: null,
        },
      ]);
    });

    it('consulta los jurados de la edición activa sin filtrar por palabra en la BD', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.search('  ana   pérez ');

      const query = callArg<{
        where: Record<string, unknown>;
        take?: number;
        select: Record<string, unknown>;
        orderBy: unknown;
      }>(prisma.user.findMany);
      expect(query.where).toEqual(jurorsOfEdition(3));
      expect(query.take).toBeUndefined();
      expect(query.orderBy).toEqual([
        { firstName: 'asc' },
        { lastName: 'asc' },
      ]);
      expect(query.select).not.toHaveProperty('email');
    });

    describe('BG-60: sin tildes ni mayúsculas', () => {
      const juror = (id: string, firstName: string, lastName: string) => ({
        id,
        firstName,
        lastName,
        jurorCategory: 'SENIOR',
        role: { name: 'Jurado' },
        jurorBadges: [],
        attendances: [],
      });
      const jurors = [
        juror('ana', 'Ana', 'Pérez'),
        juror('ivan', 'Iván', 'Cárdenas'),
        juror('oscar', 'Óscar', 'Pardo'),
      ];
      const ids = async (query: string) =>
        (await service.search(query)).map((j) => j.id);

      beforeEach(() => prisma.user.findMany.mockResolvedValue(jurors));

      it('«oscar» encuentra a Óscar Pardo', async () => {
        expect(await ids('oscar')).toEqual(['oscar']);
        expect((await service.search('oscar'))[0].name).toBe('Óscar Pardo');
      });

      it('«cardenas» e «IVAN» encuentran a Iván Cárdenas', async () => {
        expect(await ids('cardenas')).toEqual(['ivan']);
        expect(await ids('IVAN')).toEqual(['ivan']);
      });

      it('con tilde sigue funcionando y cada palabra debe coincidir', async () => {
        expect(await ids('Óscar')).toEqual(['oscar']);
        expect(await ids('  ana   perez ')).toEqual(['ana']);
        expect(await ids('ana cardenas')).toEqual([]);
      });

      it('una búsqueda que no coincide no devuelve nada', async () => {
        expect(await ids('zz')).toEqual([]);
      });

      it('conserva el orden y devuelve máximo 20 después de filtrar', async () => {
        const many = Array.from({ length: 25 }, (_, i) =>
          juror(`j${i}`, 'Óscar', `Pardo ${i}`),
        );
        prisma.user.findMany.mockResolvedValue([
          juror('ana', 'Ana', 'Pérez'),
          ...many,
        ]);

        expect(await ids('oscar')).toEqual(many.slice(0, 20).map((j) => j.id));
      });
    });

    it('sin resultados devuelve una lista vacía', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.search('zz')).resolves.toEqual([]);
    });
  });
});

describe('JurorCheckinController (permisos)', () => {
  it('exige RolePermissionGuard y el servicio JurorCheckIn', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      JurorCheckinController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
    expect(
      Reflect.getMetadata(REQUIRED_SERVICE_KEY, JurorCheckinController),
    ).toBe('JurorCheckIn');
  });

  it('GET badge valida el token como POST scan (400 si falta o está vacío)', async () => {
    for (const token of [undefined, '']) {
      const errors = await validate(plainToInstance(ScanBadgeDto, { token }));
      expect(errors).toHaveLength(1);
    }
    expect(
      await validate(plainToInstance(ScanBadgeDto, { token: 'abc' })),
    ).toHaveLength(0);
    const handler = Object.getOwnPropertyDescriptor(
      JurorCheckinController.prototype,
      'previewBadge',
    )?.value as object;
    expect(Reflect.getMetadata('path', handler)).toBe('badge');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.GET);
  });
});
