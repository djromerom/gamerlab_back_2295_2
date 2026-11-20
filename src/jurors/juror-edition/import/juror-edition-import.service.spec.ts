import { BadRequestException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { JurorService } from 'src/jurors/juror/juror.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { JurorEditionImportMailQueue } from './juror-edition-import-mail.queue';
import { JurorEditionImportService } from './juror-edition-import.service';

// Generar y leer xlsx con exceljs es lento cuando la suite corre en paralelo.
jest.setTimeout(30_000);

const ACTOR = 'admin-1';
const active = {
  id: 5,
  title: 'Feria 2026-30',
  status: 'ACTIVE',
  year: 2026,
  semester: 30,
  endsAt: new Date('2099-01-01T00:00:00Z'),
};

const HEADERS = ['Nombres', 'Apellidos', 'Correo', 'Tipo'];

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Jurados').addRows([HEADERS, ...rows]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Cuenta tal como la devuelve `findUserByEmailCaseInsensitive` con rol y estado. */
const account = (over: object = {}) => ({
  id: 'u1',
  isActive: true,
  role: { id: 4, name: 'Jurado' },
  confirmationStatus: { status: 'CONFIRMADO' },
  ...over,
});

describe('JurorEditionImportService (HU-49)', () => {
  let service: JurorEditionImportService;
  const prisma = {
    edition: { findUnique: jest.fn(), findFirst: jest.fn() },
    user: { findMany: jest.fn(), count: jest.fn() },
    jurorEdition: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const jurors = { create: jest.fn() };
  const queue = { enqueue: jest.fn() };

  /** `findUserByEmailCaseInsensitive` busca con `user.findMany`; se responde por correo. */
  const accounts = (byEmail: Record<string, object | null>) =>
    prisma.user.findMany.mockImplementation(
      (args: { where: { email: { equals: string } } }) => {
        const found = byEmail[args.where.email.equals];
        return Promise.resolve(found ? [found] : []);
      },
    );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(active);
    prisma.user.count.mockResolvedValue(0);
    prisma.jurorEdition.findUnique.mockResolvedValue(null);
    prisma.jurorEdition.upsert.mockResolvedValue({ id: 1 });
    jurors.create.mockResolvedValue({ id: 'nuevo-1' });
    accounts({});
    service = new JurorEditionImportService(
      prisma as unknown as PrismaService,
      jurors as unknown as JurorService,
      queue as unknown as JurorEditionImportMailQueue,
    );
  });

  it('correo nuevo: crea la cuenta Junior sin enviar el correo, la confirma y deja el correo en cola', async () => {
    const report = await service.import(
      await xlsx([[' Ana ', 'Pérez', ' ANA@Empresa.com ', 'Suplente']]),
      ACTOR,
    );

    expect(jurors.create).toHaveBeenCalledWith(
      {
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@empresa.com',
        jurorCategory: 'JUNIOR',
        jurorType: 'BACKUP',
      },
      { sendVerificationEmail: false },
    );
    expect(prisma.jurorEdition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          jurorId: 'nuevo-1',
          editionId: 5,
          status: 'CONFIRMED',
          type: 'BACKUP',
          updatedById: ACTOR,
        },
      }),
    );
    expect(report.rows).toEqual([
      {
        row: 2,
        email: 'ana@empresa.com',
        firstName: 'Ana',
        lastName: 'Pérez',
        type: 'BACKUP',
        result: 'CREATED',
        accountCreated: true,
        emailStatus: 'QUEUED',
      },
    ]);
    expect(queue.enqueue).toHaveBeenCalledWith(['ana@empresa.com']);
  });

  it('el Tipo vacío queda Oficial', async () => {
    await service.import(
      await xlsx([['Ana', 'Pérez', 'ana@x.com', '']]),
      ACTOR,
    );
    expect(jurors.create).toHaveBeenCalledWith(
      expect.objectContaining({ jurorType: 'OFFICIAL' }),
      expect.anything(),
    );
  });

  it('cuenta activa y verificada de Jurado: la confirma sin correo ni cuenta nueva', async () => {
    accounts({ 'ana@x.com': account() });
    prisma.jurorEdition.findUnique.mockResolvedValue({ status: 'PENDING' });

    const report = await service.import(
      await xlsx([['Ana', 'Pérez', 'ana@x.com', 'Oficial']]),
      ACTOR,
    );

    expect(jurors.create).not.toHaveBeenCalled();
    expect(prisma.jurorEdition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jurorId_editionId: { jurorId: 'u1', editionId: 5 } },
        update: { status: 'CONFIRMED', type: 'OFFICIAL', updatedById: ACTOR },
      }),
    );
    expect(report.rows[0]).toMatchObject({
      result: 'CONFIRMED',
      accountCreated: false,
      emailStatus: 'NOT_NEEDED',
    });
    expect(queue.enqueue).toHaveBeenCalledWith([]);
  });

  it('un Declinó o sin fila pasa a Confirmado', async () => {
    accounts({ 'a@x.com': account(), 'b@x.com': account({ id: 'u2' }) });
    prisma.jurorEdition.findUnique
      .mockResolvedValueOnce({ status: 'DECLINED' })
      .mockResolvedValueOnce(null);
    const report = await service.import(
      await xlsx([
        ['A', 'A', 'a@x.com', ''],
        ['B', 'B', 'b@x.com', ''],
      ]),
      ACTOR,
    );
    expect(report.rows.map((row) => row.result)).toEqual([
      'CONFIRMED',
      'CONFIRMED',
    ]);
    expect(prisma.jurorEdition.upsert).toHaveBeenCalledTimes(2);
  });

  it('ya confirmado: «ya estaba», no se toca ni se duplica', async () => {
    accounts({ 'ana@x.com': account() });
    prisma.jurorEdition.findUnique.mockResolvedValue({ status: 'CONFIRMED' });

    const report = await service.import(
      await xlsx([['Ana', 'Pérez', 'ana@x.com', 'Suplente']]),
      ACTOR,
    );

    expect(prisma.jurorEdition.upsert).not.toHaveBeenCalled();
    expect(report.rows[0]).toMatchObject({
      result: 'ALREADY_CONFIRMED',
      emailStatus: 'NOT_NEEDED',
    });
  });

  it.each([
    ['inactiva y sin verificar', { isActive: false }],
    ['activa pero sin verificar (creada en Personal → Jurados)', {}],
  ])('cuenta %s: reenvía la verificación y confirma', async (_label, over) => {
    accounts({
      'ana@x.com': account({
        ...over,
        confirmationStatus: { status: 'PENDIENTE' },
      }),
    });

    const report = await service.import(
      await xlsx([['Ana', 'Pérez', 'ana@x.com', '']]),
      ACTOR,
    );

    expect(report.rows[0]).toMatchObject({
      result: 'CONFIRMED',
      emailStatus: 'QUEUED',
    });
    expect(queue.enqueue).toHaveBeenCalledWith(['ana@x.com']);
    expect(prisma.jurorEdition.upsert).toHaveBeenCalled();
  });

  it('profesor con NRC activo en la edición: ya es jurado automático, no se crea fila', async () => {
    accounts({
      'prof@x.com': account({ id: 'p1', role: { id: 3, name: 'Profesor' } }),
    });
    prisma.user.count.mockResolvedValue(1); // professorsOfEdition

    const report = await service.import(
      await xlsx([['Pro', 'Fesor', 'prof@x.com', '']]),
      ACTOR,
    );

    expect(report.rows[0]).toMatchObject({
      result: 'ALREADY_CONFIRMED',
      message: expect.stringContaining('NRC') as string,
    });
    expect(prisma.jurorEdition.upsert).not.toHaveBeenCalled();
  });

  it('profesor sin NRC en la edición: queda confirmado', async () => {
    accounts({
      'prof@x.com': account({ id: 'p1', role: { id: 3, name: 'Profesor' } }),
    });
    const report = await service.import(
      await xlsx([['Pro', 'Fesor', 'prof@x.com', '']]),
      ACTOR,
    );
    expect(report.rows[0].result).toBe('CONFIRMED');
  });

  it.each([
    ['Estudiante', {}, 'WRONG_ROLE'],
    [
      'Jurado desactivado',
      { isActive: false, confirmationStatus: { status: 'CONFIRMADO' } },
      'ACCOUNT_DISABLED',
    ],
  ])('%s: error en la fila, sin tocar nada', async (name, over, code) => {
    accounts({
      'ana@x.com': account({
        ...(name === 'Estudiante'
          ? { role: { id: 2, name: 'Estudiante' } }
          : {}),
        ...over,
      }),
    });
    const report = await service.import(
      await xlsx([['Ana', 'Pérez', 'ana@x.com', '']]),
      ACTOR,
    );
    expect(report.rows[0]).toMatchObject({
      result: 'ERROR',
      error: code,
      emailStatus: 'NOT_NEEDED',
    });
    expect(prisma.jurorEdition.upsert).not.toHaveBeenCalled();
    expect(jurors.create).not.toHaveBeenCalled();
  });

  it('las filas inválidas salen en el informe con su motivo y no frenan a las demás', async () => {
    const report = await service.import(
      await xlsx([
        ['Ana', 'Pérez', 'ana@x.com', ''],
        ['Eva', 'Ruiz', 'correo-malo', ''],
        ['Sin', 'Tipo', 'tipo@x.com', 'Senior'],
        ['Ana', 'Otra', 'ANA@x.com', ''],
        ['Luis', 'Gómez', 'luis@x.com', 'Suplente'],
      ]),
      ACTOR,
    );

    expect(report.rows.map((row) => [row.row, row.result, row.error])).toEqual([
      [2, 'CREATED', undefined],
      [3, 'ERROR', 'INVALID_EMAIL'],
      [4, 'ERROR', 'INVALID_TYPE'],
      [5, 'ERROR', 'DUPLICATE_IN_FILE'],
      [6, 'CREATED', undefined],
    ]);
    expect(report.summary).toEqual({
      total: 5,
      created: 2,
      confirmed: 0,
      alreadyConfirmed: 0,
      errors: 3,
      emailsQueued: 2,
    });
    expect(queue.enqueue).toHaveBeenCalledWith(['ana@x.com', 'luis@x.com']);
    expect(report.edition).toEqual({ id: 5, title: 'Feria 2026-30' });
  });

  it('si falla el alta de una cuenta, esa fila da error y las demás siguen', async () => {
    jurors.create
      .mockRejectedValueOnce(new Error('boom con datos internos'))
      .mockResolvedValueOnce({ id: 'nuevo-2' });

    const report = await service.import(
      await xlsx([
        ['Ana', 'Pérez', 'ana@x.com', ''],
        ['Luis', 'Gómez', 'luis@x.com', ''],
      ]),
      ACTOR,
    );

    expect(report.rows[0]).toMatchObject({
      result: 'ERROR',
      error: 'ACCOUNT_CREATION_FAILED',
    });
    // El mensaje al cliente no filtra el error interno.
    expect(report.rows[0].message).not.toContain('boom');
    expect(report.rows[1].result).toBe('CREATED');
    expect(queue.enqueue).toHaveBeenCalledWith(['luis@x.com']);
    expect(prisma.jurorEdition.upsert).toHaveBeenCalledTimes(1);
  });

  it('un error inesperado en la BD en una fila no tumba el resto', async () => {
    prisma.user.findMany
      .mockRejectedValueOnce(new Error('conexión perdida'))
      .mockResolvedValue([]);
    const report = await service.import(
      await xlsx([
        ['Ana', 'Pérez', 'ana@x.com', ''],
        ['Luis', 'Gómez', 'luis@x.com', ''],
      ]),
      ACTOR,
    );
    expect(report.rows.map((row) => row.error ?? row.result)).toEqual([
      'UNEXPECTED',
      'CREATED',
    ]);
  });

  describe('el archivo o la edición no sirven: no se importa nada', () => {
    it('no es un xlsx → 400', async () => {
      await expect(service.import(Buffer.from('a,b,c'), ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('sin las columnas de la plantilla → 400', async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('X').addRows([
        ['A', 'B'],
        ['1', '2'],
      ]);
      await expect(
        service.import(Buffer.from(await workbook.xlsx.writeBuffer()), ACTOR),
      ).rejects.toThrow('no sigue la plantilla');
      expect(jurors.create).not.toHaveBeenCalled();
    });

    it('sin edición activa → 404', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(
        service.import(await xlsx([['A', 'B', 'a@x.com', '']]), ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('edición activa de solo lectura → 400', async () => {
      prisma.edition.findFirst.mockResolvedValue({
        ...active,
        status: 'ARCHIVED',
      });
      await expect(
        service.import(await xlsx([['A', 'B', 'a@x.com', '']]), ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(jurors.create).not.toHaveBeenCalled();
    });
  });

  it('solo usa la edición activa (no recibe editionId)', async () => {
    await service.import(await xlsx([['A', 'B', 'a@x.com', '']]), ACTOR);
    expect(prisma.edition.findUnique).not.toHaveBeenCalled();
    expect(prisma.edition.findFirst).toHaveBeenCalled();
  });
});
