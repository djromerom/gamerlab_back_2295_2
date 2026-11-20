import {
  AbsentJurorResponseResult,
  CheckInMethod,
  EditionStatus,
  JurorEditionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AbsentJurorResponsesService } from './absent-juror-responses.service';

/**
 * Integración (HU-13) contra Postgres real. Solo corre con RUN_DB_TESTS=1 sobre una base desechable
 * con migraciones y seed. Usa la edición activa (o crea una de 2098 si no hay) y borra sus propios
 * datos al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-13: respuestas sobre jurados ausentes (BD real)', () => {
  const prisma = new PrismaService();
  const service = new AbsentJurorResponsesService(prisma);
  const tag = randomUUID().slice(0, 8);
  const users: string[] = [];
  let editionId = 0;
  let createdEdition = false;
  let jurorId = '';
  let adminId = '';

  const createUser = async (key: string, role: string) => {
    const { id: roleId } = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const { id } = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu13.test`,
        firstName: key,
        lastName: `HU13${tag}`,
        roleId,
      },
      select: { id: true },
    });
    users.push(id);
    return id;
  };

  const setStatus = (status: JurorEditionStatus) =>
    prisma.jurorEdition.update({
      where: { jurorId_editionId: { jurorId, editionId } },
      data: { status },
    });

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    if (active) {
      editionId = active.id;
    } else {
      const created = await prisma.edition.create({
        data: {
          year: 2098,
          semester: 30,
          title: `HU13 ${tag}`,
          status: EditionStatus.ACTIVE,
          startsAt: new Date('2098-11-26T13:00:00.000Z'),
          endsAt: new Date('2098-11-26T23:00:00.000Z'),
        },
      });
      editionId = created.id;
      createdEdition = true;
    }
    adminId = await createUser('admin', 'Administrador');
    jurorId = await createUser('juror', 'Jurado');
    await prisma.jurorEdition.create({
      data: { jurorId, editionId, status: JurorEditionStatus.CONFIRMED },
    });
  });

  afterAll(async () => {
    const where = { jurorId: { in: users } };
    await prisma.absentJurorResponse.deleteMany({ where });
    await prisma.jurorAttendance.deleteMany({ where });
    await prisma.jurorEdition.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (createdEdition) {
      await prisma.edition.delete({ where: { id: editionId } });
    }
    await prisma.$disconnect();
  });

  it('acumula el historial, conserva la constancia y frena al que ya llegó', async () => {
    await service.create(
      { jurorId, result: AbsentJurorResponseResult.NO_RESPONSE },
      adminId,
    );
    const second = await service.create(
      {
        jurorId,
        result: AbsentJurorResponseResult.ON_THE_WAY,
        estimatedArrivalAt: '2026-11-26T15:30:00Z',
      },
      adminId,
    );
    expect(second.estimatedArrivalAt).toEqual(new Date('2026-11-26T15:30:00Z'));

    const history = await service.history(jurorId);
    expect(history.data.map((item) => item.result)).toEqual([
      AbsentJurorResponseResult.ON_THE_WAY,
      AbsentJurorResponseResult.NO_RESPONSE,
    ]);
    expect(history.data[0].recordedBy.id).toBe(adminId);

    // Declinó: ya no se registra sobre él, pero la constancia sigue.
    await setStatus(JurorEditionStatus.DECLINED);
    await expect(
      service.create(
        { jurorId, result: AbsentJurorResponseResult.CANNOT_ATTEND },
        adminId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.history(jurorId)).data).toHaveLength(2);

    // Llegó: 409.
    await setStatus(JurorEditionStatus.CONFIRMED);
    await prisma.jurorAttendance.create({
      data: {
        jurorId,
        editionId,
        checkedInById: adminId,
        method: CheckInMethod.MANUAL,
      },
    });
    await expect(
      service.create(
        { jurorId, result: AbsentJurorResponseResult.NO_RESPONSE },
        adminId,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
