import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JurorService } from './juror.service';

// ARK-139: el profesor aparece en la tabla de jurados como Senior y se edita desde ahí.
describe('JurorService: profesores en la tabla de jurados (ARK-139)', () => {
  const jurorRoleId = 4;
  const professorRoleId = 3;
  const studentRoleId = 2;

  const professor = {
    id: 'prof-1',
    email: 'profe@uninorte.edu.co',
    firstName: 'Profe',
    lastName: 'Prueba',
    roleId: professorRoleId,
    confirmationStatusId: 1,
    lastSignInAt: null,
    isActive: true,
    jurorCategory: 'SENIOR',
    jurorType: 'OFFICIAL',
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    team: { findMany: jest.fn() },
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    evaluation: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const auth = { invalidateUserProfileCache: jest.fn() };
  let service: JurorService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prisma.user.findMany.mockResolvedValue([]);
    prisma.evaluation.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([]);
    prisma.edition.findFirst.mockResolvedValue({ id: 5 });
    service = new JurorService(auth as any, prisma as any, {} as any);
    (service as any).jurorRoleId = jurorRoleId;
    (service as any).professorRoleId = professorRoleId;
  });

  it('edita a un profesor (antes respondía 404) y devuelve isProfessor', async () => {
    prisma.user.findUnique.mockResolvedValue(professor);
    prisma.user.update.mockResolvedValue({ ...professor, jurorType: 'BACKUP' });

    const result = await service.update(professor.id, {
      jurorCategory: 'SENIOR',
      jurorType: 'BACKUP',
    } as any);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: professor.id },
      data: { jurorCategory: 'SENIOR', jurorType: 'BACKUP' },
    });
    expect(result).toMatchObject({
      jurorCategory: 'SENIOR',
      jurorType: 'BACKUP',
      isProfessor: true,
    });
  });

  it('no deja pasar a un profesor a Junior', async () => {
    prisma.user.findUnique.mockResolvedValue(professor);

    await expect(
      service.update(professor.id, { jurorCategory: 'JUNIOR' } as any),
    ).rejects.toThrow(
      new BadRequestException(
        'Un profesor siempre es jurado Senior; solo se puede cambiar su tipo.',
      ),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('un jurado sí puede pasar a Junior', async () => {
    const juror = { ...professor, id: 'jur-1', roleId: jurorRoleId };
    prisma.user.findUnique.mockResolvedValue(juror);
    prisma.user.update.mockResolvedValue({ ...juror, jurorCategory: 'JUNIOR' });

    const result = await service.update(juror.id, {
      jurorCategory: 'JUNIOR',
    } as any);

    expect(result).toMatchObject({
      jurorCategory: 'JUNIOR',
      isProfessor: false,
    });
  });

  it.each([
    ['un estudiante', { ...professor, roleId: studentRoleId }],
    ['un profesor inactivo', { ...professor, isActive: false }],
    ['un usuario que no existe', null],
  ])('responde 404 al editar %s', async (_label, user) => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      service.update(professor.id, { jurorType: 'BACKUP' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('GET y DELETE /juror/:id siguen siendo solo para jurados', async () => {
    prisma.user.findUnique.mockResolvedValue(professor);
    await expect(service.findOne(professor.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('el listado marca a los profesores con isProfessor', async () => {
    const juror = {
      ...professor,
      id: 'jur-1',
      roleId: jurorRoleId,
      jurorCategory: 'JUNIOR',
    };
    prisma.user.findMany.mockResolvedValue([
      { ...professor, evaluationsSubmitted: [] },
      { ...juror, evaluationsSubmitted: [] },
    ]);
    prisma.user.count.mockResolvedValue(2);

    const { data } = await service.findAll(false, 10, 1);

    expect(data.map((d) => [d.id, d.jurorCategory, d.isProfessor])).toEqual([
      ['prof-1', 'SENIOR', true],
      ['jur-1', 'JUNIOR', false],
    ]);
  });
});
