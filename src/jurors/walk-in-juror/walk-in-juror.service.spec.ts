import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateWalkInJurorDto } from './dto/create-walk-in-juror.dto';
import { WalkInJurorService } from './walk-in-juror.service';

const ADMIN_ID = 'admin-1';
const edition = { id: 5, title: 'ARKAD 2026-30' };
const checkedInAt = new Date('2026-11-26T14:12:05.000Z');
const dto = (extra: Partial<CreateWalkInJurorDto> = {}) =>
  ({
    firstName: 'Laura',
    lastName: 'Gómez',
    email: 'Laura.Gomez@Ejemplo.com',
    ...extra,
  }) as CreateWalkInJurorDto;

/** Fila de `user.findMany` para una persona que ya existe. */
const existingRow = (
  id: string,
  role: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  firstName: 'Laura',
  lastName: 'Gómez',
  email: 'laura.gomez@ejemplo.com',
  isActive: true,
  role: { name: role },
  jurorEditions: [],
  attendances: [],
  ...extra,
});

describe('WalkInJurorService (HU-24)', () => {
  const tx = {
    role: { findFirst: jest.fn() },
    user: { update: jest.fn() },
    jurorEdition: { create: jest.fn() },
    jurorAttendance: { create: jest.fn() },
  };
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const auth = {
    registerUserTransaction: jest.fn(),
    sendVerificationEmail: jest.fn(),
  };
  const logger = { error: jest.fn(), log: jest.fn() };
  let service: WalkInJurorService;

  /**
   * `user.findMany` atiende, en orden: dueños del correo, cuentas para comparar nombres y, si hay
   * algo que mostrar, el detalle de las personas y cuáles son jurados de la edición.
   */
  const mockUsers = (...results: unknown[][]) => {
    prisma.user.findMany.mockReset();
    for (const result of results) {
      prisma.user.findMany.mockResolvedValueOnce(result);
    }
    prisma.user.findMany.mockResolvedValue([]);
  };

  const flushImmediate = () =>
    new Promise<void>((resolve) => setImmediate(resolve));

  const failure = (body: CreateWalkInJurorDto) =>
    service.create(body, ADMIN_ID).then(
      () => {
        throw new Error('se esperaba un error');
      },
      (error) => error,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(edition);
    prisma.$transaction.mockImplementation(
      (run: (client: typeof tx) => unknown) => run(tx),
    );
    tx.role.findFirst.mockResolvedValue({ id: 3 });
    tx.jurorAttendance.create.mockResolvedValue({
      checkedInAt,
      method: 'MANUAL',
    });
    auth.registerUserTransaction.mockResolvedValue({
      user: { id: 'new-1', email: 'laura.gomez@ejemplo.com' },
      verificationToken: 'token-1',
    });
    auth.sendVerificationEmail.mockResolvedValue({ message: 'ok' });
    mockUsers([], []);
    service = new WalkInJurorService(prisma as any, auth as any);
    (service as any).logger = logger;
  });

  describe('alta nueva', () => {
    it('crea al jurado como Junior y Suplente, activo, con el correo en minúsculas', async () => {
      const result = await service.create(dto(), ADMIN_ID);

      expect(auth.registerUserTransaction).toHaveBeenCalledWith(
        { email: 'laura.gomez@ejemplo.com' },
        tx,
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'new-1' },
        data: {
          firstName: 'Laura',
          lastName: 'Gómez',
          roleId: 3,
          isActive: true,
          jurorCategory: 'JUNIOR',
          jurorType: 'BACKUP',
          lastSignInAt: null,
        },
      });
      expect(result).toEqual({
        juror: {
          id: 'new-1',
          name: 'Laura Gómez',
          email: 'laura.gomez@ejemplo.com',
          category: 'JUNIOR',
          type: 'BACKUP',
        },
        edition,
        attendance: { checkedInAt, method: 'MANUAL' },
        walkIn: true,
      });
    });

    it('lo inscribe en la edición activa como Confirmado y Suplente con la marca walkIn', async () => {
      await service.create(dto(), ADMIN_ID);

      expect(tx.jurorEdition.create).toHaveBeenCalledWith({
        data: {
          jurorId: 'new-1',
          editionId: 5,
          status: 'CONFIRMED',
          type: 'BACKUP',
          walkIn: true,
          updatedById: ADMIN_ID,
        },
      });
    });

    it('registra su llegada manual con quien la hizo, sin escarapela', async () => {
      await service.create(dto(), ADMIN_ID);

      expect(tx.jurorAttendance.create).toHaveBeenCalledWith({
        data: {
          jurorId: 'new-1',
          editionId: 5,
          checkedInById: ADMIN_ID,
          method: 'MANUAL',
        },
        select: { checkedInAt: true, method: true },
      });
    });

    it('cuenta, inscripción y llegada van en una sola transacción', async () => {
      await service.create(dto(), ADMIN_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.role.findFirst).toHaveBeenCalledWith({
        where: { name: 'Jurado' },
        select: { id: true },
      });
    });

    it('envía el correo para crear la cuenta después de guardar', async () => {
      await service.create(dto(), ADMIN_ID);
      expect(auth.sendVerificationEmail).not.toHaveBeenCalled();

      await flushImmediate();
      expect(auth.sendVerificationEmail).toHaveBeenCalledWith(
        'laura.gomez@ejemplo.com',
        'token-1',
      );
    });

    it('si falla el envío del correo el jurado queda creado', async () => {
      auth.sendVerificationEmail.mockRejectedValue(new Error('ACS caído'));

      await expect(service.create(dto(), ADMIN_ID)).resolves.toMatchObject({
        juror: { id: 'new-1' },
      });
      await flushImmediate();
      await flushImmediate();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('fallos', () => {
    it('sin edición activa responde 404 y no crea nada', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      expect(await failure(dto())).toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si falla un paso de la transacción responde 500 en español y no envía correo', async () => {
      tx.jurorAttendance.create.mockRejectedValue(new Error('boom'));

      const error = await failure(dto());

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(error.message).toContain('no se creó ninguna cuenta');
      await flushImmediate();
      expect(auth.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('correo repetido', () => {
    const enrolled = existingRow('j1', 'Jurado', {
      jurorEditions: [{ status: 'CONFIRMED' }],
    });

    it('responde 409 EMAIL_ALREADY_EXISTS con el jurado de la edición y ofrece marcar su llegada', async () => {
      mockUsers([enrolled], [enrolled], [{ id: 'j1' }]);

      const error = await failure(dto());

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: expect.stringContaining('marca su llegada'),
        existing: {
          id: 'j1',
          name: 'Laura Gómez',
          role: 'Jurado',
          isActive: true,
          isJurorOfEdition: true,
          editionStatus: 'CONFIRMED',
          checkedInAt: null,
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un jurado ya registrado no cambia: ni tipo, ni inscripción, ni llegada', async () => {
      mockUsers([enrolled], [enrolled], [{ id: 'j1' }]);

      await failure(dto({ confirmSimilar: true }));

      expect(auth.registerUserTransaction).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.jurorEdition.create).not.toHaveBeenCalled();
      expect(tx.jurorAttendance.create).not.toHaveBeenCalled();
    });

    it('si ya tiene la llegada registrada lo dice y devuelve la hora', async () => {
      const arrived = { ...enrolled, attendances: [{ checkedInAt }] };
      mockUsers([arrived], [arrived], [{ id: 'j1' }]);

      const error = await failure(dto());

      expect(error.getResponse()).toMatchObject({
        message: expect.stringContaining('ya tiene su llegada registrada'),
        existing: { checkedInAt },
      });
    });

    it('si la cuenta de jurado no está en la edición lo indica y no la inscribe', async () => {
      const declined = existingRow('j1', 'Jurado', {
        jurorEditions: [{ status: 'DECLINED' }],
      });
      mockUsers([declined], [declined], []);

      const error = await failure(dto());

      expect(error.getResponse()).toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
        message: expect.stringContaining('Jurados de la edición'),
        existing: { isJurorOfEdition: false, editionStatus: 'DECLINED' },
      });
      expect(tx.jurorEdition.create).not.toHaveBeenCalled();
    });

    it('si el correo es de un profesor no se crea como jurado', async () => {
      const professor = existingRow('p1', 'Profesor');
      mockUsers([professor], [professor], [{ id: 'p1' }]);

      const error = await failure(dto({ confirmSimilar: true }));

      expect(error.getResponse()).toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
        existing: { id: 'p1', role: 'Profesor', isJurorOfEdition: true },
      });
      expect(auth.registerUserTransaction).not.toHaveBeenCalled();
    });

    it('dos altas simultáneas: la que pierde responde el mismo 409', async () => {
      auth.registerUserTransaction.mockRejectedValue(
        new ConflictException('A user with that email already exists'),
      );

      const error = await failure(dto());

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
      });
    });
  });

  describe('coincidencia por nombre', () => {
    const people = [
      { id: 'j7', firstName: 'Laura María', lastName: 'Gómez Ruiz' },
      { id: 'p3', firstName: 'LAURA', lastName: 'GOMEZ' },
      { id: 'j8', firstName: 'Luis', lastName: 'Gómez' },
    ];
    const details = [
      existingRow('j7', 'Jurado', {
        firstName: 'Laura María',
        lastName: 'Gómez Ruiz',
        jurorEditions: [{ status: 'CONFIRMED' }],
      }),
      existingRow('p3', 'Profesor', { firstName: 'LAURA', lastName: 'GOMEZ' }),
    ];

    it('responde 409 SIMILAR_PEOPLE con jurados y profesores parecidos, sin correos', async () => {
      mockUsers([], people, details, [{ id: 'j7' }]);

      const error = await failure(dto());

      expect(error).toBeInstanceOf(ConflictException);
      const body = error.getResponse();
      expect(body).toMatchObject({ statusCode: 409, code: 'SIMILAR_PEOPLE' });
      expect(body.matches).toEqual([
        {
          id: 'j7',
          name: 'Laura María Gómez Ruiz',
          role: 'Jurado',
          isActive: true,
          isJurorOfEdition: true,
          editionStatus: 'CONFIRMED',
          checkedInAt: null,
        },
        {
          id: 'p3',
          name: 'LAURA GOMEZ',
          role: 'Profesor',
          isActive: true,
          isJurorOfEdition: false,
          editionStatus: null,
          checkedInAt: null,
        },
      ]);
      expect(JSON.stringify(body)).not.toContain('@');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('solo compara con cuentas activas de jurado o profesor', async () => {
      await service.create(dto(), ADMIN_ID);

      expect(prisma.user.findMany.mock.calls[1][0].where).toEqual({
        isActive: true,
        role: { name: { in: ['Jurado', 'Profesor'] } },
      });
    });

    it('con confirmSimilar crea al jurado sin buscar parecidos', async () => {
      mockUsers([]);

      await expect(
        service.create(dto({ confirmSimilar: true }), ADMIN_ID),
      ).resolves.toMatchObject({ walkIn: true });
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
