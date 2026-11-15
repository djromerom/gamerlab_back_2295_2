import { PrismaService } from 'src/prisma/prisma.service';
import { JurorEditionService } from './juror-edition.service';

const person = (id: string, role: string) => ({
  id,
  firstName: 'Ana',
  lastName: `Apellido ${id}`,
  email: `${id}@x.com`,
  jurorCategory: role === 'Jurado' ? 'JUNIOR' : null,
  role: { name: role },
});

/** HU-24 (ARK-217): la lista de la edición dice quién se dio de alta el día de la feria. */
describe('JurorEditionService.list · walkIn (HU-24)', () => {
  const prisma = {
    edition: {
      findFirst: jest.fn().mockResolvedValue({
        id: 5,
        title: 'Feria 2026-30',
        status: 'ACTIVE',
        year: 2026,
        semester: 30,
      }),
    },
    jurorEdition: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new JurorEditionService(prisma as unknown as PrismaService);

  it('marca al jurado dado de alta ese día; los demás inscritos y el profesor automático, no', async () => {
    prisma.jurorEdition.findMany.mockResolvedValue([
      {
        type: 'BACKUP',
        status: 'CONFIRMED',
        walkIn: true,
        updatedAt: new Date('2026-11-26T14:00:00Z'),
        juror: person('j1', 'Jurado'),
      },
      {
        type: 'OFFICIAL',
        status: 'CONFIRMED',
        walkIn: false,
        updatedAt: null,
        juror: person('j2', 'Jurado'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([person('p1', 'Profesor')]);

    const result = await service.list({ page: 1, limit: 20 });

    expect(
      Object.fromEntries(result.data.map((i) => [i.jurorId, i.walkIn])),
    ).toEqual({ j1: true, j2: false, p1: false });
    expect(prisma.jurorEdition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ walkIn: true }),
      }),
    );
  });
});
