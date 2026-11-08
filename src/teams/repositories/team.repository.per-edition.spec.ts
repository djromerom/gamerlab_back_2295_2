import { ConflictException } from '@nestjs/common';
import { TeamRepository } from './team.repository';

/**
 * ARK-128 (BG-17): la cuenta del estudiante se conserva entre ediciones; integrante, equipo y
 * videojuego son de una edición. Quien participó en la edición 4 se inscribe en la 5 como
 * cualquier otro, pero nadie puede estar dos veces en la misma edición.
 */
describe('TeamRepository — inscripción por edición (ARK-128)', () => {
  const ACTIVE = 5;

  const member = (email: string, studentCode: string) => ({
    memberEmail: email,
    memberFirstName: 'Ana',
    memberLastName: 'Pérez',
    studentCode,
    nrc: ['9999'],
  });

  describe('checkEmailsExist', () => {
    const build = (users: any[], members: any[]) => {
      const prisma = {
        user: { findMany: jest.fn().mockResolvedValue(users) },
        member: { findMany: jest.fn().mockResolvedValue(members) },
      };
      return { prisma, repository: new TeamRepository(prisma as any, {} as any) };
    };

    it('la cuenta de un estudiante de una edición anterior no ocupa el correo', async () => {
      const { repository } = build(
        [{ email: 'lider4@uninorte.edu.co', roleId: 2, isActive: true }],
        [],
      );
      await expect(
        repository.checkEmailsExist(['lider4@uninorte.edu.co']),
      ).resolves.toEqual({ 'lider4@uninorte.edu.co': false });
    });

    it('un integrante de la edición activa sí ocupa el correo', async () => {
      const { repository } = build(
        [],
        [{ email: 'ya5@uninorte.edu.co' }],
      );
      await expect(
        repository.checkEmailsExist(['YA5@uninorte.edu.co']),
      ).resolves.toEqual({ 'YA5@uninorte.edu.co': true });
    });

    it('solo busca integrantes de la edición activa', async () => {
      const { prisma, repository } = build([], []);
      await repository.checkEmailsExist(['a@uninorte.edu.co']);
      expect(prisma.member.findMany.mock.calls[0][0].where.edition).toEqual({
        status: 'ACTIVE',
      });
    });

    it('una cuenta de profesor, jurado o desactivada sigue ocupando el correo', async () => {
      const { repository } = build(
        [
          { email: 'profe@uninorte.edu.co', roleId: 3, isActive: true },
          { email: 'jurado@uninorte.edu.co', roleId: 4, isActive: true },
          { email: 'baja@uninorte.edu.co', roleId: 2, isActive: false },
        ],
        [],
      );
      await expect(
        repository.checkEmailsExist([
          'profe@uninorte.edu.co',
          'jurado@uninorte.edu.co',
          'baja@uninorte.edu.co',
        ]),
      ).resolves.toEqual({
        'profe@uninorte.edu.co': true,
        'jurado@uninorte.edu.co': true,
        'baja@uninorte.edu.co': true,
      });
    });
  });

  it('findExistingStudentCodes solo mira la edición activa', async () => {
    const prisma = {
      member: { findMany: jest.fn().mockResolvedValue([{ studentCode: '200' }]) },
    };
    const repository = new TeamRepository(prisma as any, {} as any);

    await expect(repository.findExistingStudentCodes(['200', '300'])).resolves.toEqual(
      new Set(['200']),
    );
    expect(prisma.member.findMany).toHaveBeenCalledWith({
      where: { studentCode: { in: ['200', '300'] }, edition: { status: 'ACTIVE' } },
      select: { studentCode: true },
    });
  });

  it('findOneWithDetailsByLeaderId ("Mi equipo") busca el equipo de la edición activa', async () => {
    const prisma = { team: { findFirst: jest.fn().mockResolvedValue(null) } };
    const repository = new TeamRepository(prisma as any, {} as any);

    await repository.findOneWithDetailsByLeaderId('u-1');

    expect(prisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-1', edition: { status: 'ACTIVE' } },
        orderBy: { editionId: 'desc' },
      }),
    );
  });

  describe('handleUser', () => {
    const studentRole = { id: 2, name: 'Estudiante' };
    const existing = { id: 'u-4', email: 'lider4@uninorte.edu.co' };
    const makeTx = (teamInEdition: unknown) => ({
      role: { findUnique: jest.fn().mockResolvedValue(studentRole) },
      user: { findMany: jest.fn().mockResolvedValue([existing]), update: jest.fn() },
      team: { findUnique: jest.fn().mockResolvedValue(teamInEdition) },
    });
    const auth = { registerUserTransaction: jest.fn() };
    const repo = new TeamRepository({} as any, auth as any) as any;

    beforeEach(() => jest.clearAllMocks());

    it('el líder de la edición anterior reutiliza su cuenta y no recibe correo de verificación', async () => {
      const tx = makeTx(null);

      const result = await repo.handleUser(tx, member(existing.email, '100'), ACTIVE);

      expect(result).toEqual({ userId: 'u-4', verificationToken: null });
      expect(tx.team.findUnique).toHaveBeenCalledWith({
        where: { userId_editionId: { userId: 'u-4', editionId: ACTIVE } },
        select: { id: true },
      });
      expect(auth.registerUserTransaction).not.toHaveBeenCalled();
    });

    it('si ya lidera un equipo en la misma edición responde 409', async () => {
      const tx = makeTx({ id: 99 });

      await expect(
        repo.handleUser(tx, member(existing.email, '100'), ACTIVE),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createMembers', () => {
    const makeTx = (duplicate: unknown) => ({
      member: {
        findFirst: jest.fn().mockResolvedValue(duplicate),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      nRC: { findMany: jest.fn().mockResolvedValue([{ id: 41, code: 9999, subjectId: 1, subject: { name: 'POO' } }]) },
    });
    const repo = new TeamRepository({} as any, {} as any) as any;

    it('crea al integrante de la edición 4 como integrante nuevo de la edición activa', async () => {
      const tx = makeTx(null);

      await repo.createMembers(tx, 10, ACTIVE, [member('int4@uninorte.edu.co', '200')]);

      expect(tx.member.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ editionId: ACTIVE }),
        }),
      );
      expect(tx.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teamId: 10, editionId: ACTIVE }),
        }),
      );
    });

    it('un estudiante no puede estar dos veces en la misma edición (correo)', async () => {
      const tx = makeTx({ email: 'Int4@uninorte.edu.co' });

      await expect(
        repo.createMembers(tx, 10, ACTIVE, [member('int4@uninorte.edu.co', '200')]),
      ).rejects.toThrow('El correo int4@uninorte.edu.co ya está registrado en un equipo de esta edición');
      expect(tx.member.create).not.toHaveBeenCalled();
    });

    it('un estudiante no puede estar dos veces en la misma edición (código)', async () => {
      const tx = makeTx({ email: 'otro@uninorte.edu.co' });

      await expect(
        repo.createMembers(tx, 10, ACTIVE, [member('int4@uninorte.edu.co', '200')]),
      ).rejects.toThrow('El código estudiantil 200 ya está registrado en un equipo de esta edición');
    });
  });

  describe('nombre de equipo repetido en la misma edición (creación y edición del administrador)', () => {
    const repo = new TeamRepository({} as any, {} as any) as any;

    it('createTeamRecord responde 409 con mensaje claro y no crea el equipo', async () => {
      const tx = {
        team: { findFirst: jest.fn().mockResolvedValue({ id: 99 }), create: jest.fn() },
      };

      await expect(
        repo.createTeamRecord(
          tx,
          { teamName: 'Equipo Beta', members: [member('a@uninorte.edu.co', '1')] },
          'u-1',
          ACTIVE,
        ),
      ).rejects.toThrow('Ya existe un equipo con el nombre "Equipo Beta" en esta edición.');
      expect(tx.team.findFirst.mock.calls[0][0].where.editionId).toBe(ACTIVE);
      expect(tx.team.create).not.toHaveBeenCalled();
    });

    it('updateTeam compara solo con otros equipos de la edición del equipo', async () => {
      const tx = {
        team: {
          findUnique: jest.fn().mockResolvedValue({ editionId: ACTIVE }),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({ id: 7 }),
        },
      };

      await repo.updateTeam(tx, 7, { teamName: 'Equipo Alpha' });

      expect(tx.team.findFirst.mock.calls[0][0].where).toMatchObject({
        editionId: ACTIVE,
        id: { not: 7 },
      });
      expect(tx.team.update).toHaveBeenCalled();
    });

    it('updateTeam responde 409 si otro equipo de la misma edición ya usa el nombre', async () => {
      const tx = {
        team: {
          findUnique: jest.fn().mockResolvedValue({ editionId: ACTIVE }),
          findFirst: jest.fn().mockResolvedValue({ id: 8 }),
          update: jest.fn(),
        },
      };

      await expect(repo.updateTeam(tx, 7, { teamName: 'Equipo Alpha' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.team.update).not.toHaveBeenCalled();
    });

    it('updateTeam sin teamName no consulta nombres', async () => {
      const tx = {
        team: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      };

      await repo.updateTeam(tx, 7, { isExternal: true });

      expect(tx.team.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('updateMembers: quién es el líder', () => {
    const repo = new TeamRepository({} as any, {} as any) as any;
    const makeTx = (memberUserId: string | null) => ({
      team: { findUnique: jest.fn().mockResolvedValue({ editionId: ACTIVE, userId: 'lider-514' }) },
      member: {
        findUnique: jest.fn().mockResolvedValue({ id: 17, email: 'viejo@uninorte.edu.co' }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 17 }),
      },
      user: {
        findUnique: jest
          .fn()
          // 1.ª: la cuenta del correo actual del integrante; 2.ª: ¿el correo nuevo ya es de otra cuenta?
          .mockResolvedValueOnce(memberUserId ? { id: memberUserId } : null)
          .mockResolvedValueOnce({ id: 'otra-cuenta', email: 'nuevo@uninorte.edu.co' }),
        update: jest.fn(),
      },
      nRC: { findMany: jest.fn().mockResolvedValue([]) },
    });

    it('un integrante con cuenta de OTRA edición no se trata como líder: no se toca su cuenta', async () => {
      const tx = makeTx('lider-de-la-edicion-3');

      await repo.updateMembers(tx, 514, [{ id: 17, memberEmail: 'nuevo@uninorte.edu.co' }]);

      expect(tx.member.update).toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('el líder de este equipo sí actualiza su cuenta (y choca si el correo es de otra)', async () => {
      const tx = makeTx('lider-514');

      await expect(
        repo.updateMembers(tx, 514, [{ id: 17, memberEmail: 'nuevo@uninorte.edu.co' }]),
      ).rejects.toThrow('El correo nuevo@uninorte.edu.co ya está en uso por otro usuario');
    });
  });

  describe('remove: la cuenta del líder se conserva si tiene equipos en otras ediciones', () => {
    const build = (otherTeams: number) => {
      const tx = {
        team: {
          findUnique: jest.fn().mockResolvedValue({ id: 514, user: { id: 'u-4', email: 'l@u.co' } }),
          delete: jest.fn().mockResolvedValue({ id: 514 }),
          count: jest.fn().mockResolvedValue(otherTeams),
        },
        verificationToken: { deleteMany: jest.fn() },
        user: { delete: jest.fn() },
      };
      const prisma = { $transaction: jest.fn().mockImplementation((fn) => fn(tx)) };
      return { tx, repository: new TeamRepository(prisma as any, {} as any) };
    };

    it('con equipo en otra edición borra solo el equipo', async () => {
      const { tx, repository } = build(1);

      await expect(repository.remove(514)).resolves.toEqual({ id: 514 });
      expect(tx.team.count).toHaveBeenCalledWith({ where: { userId: 'u-4' } });
      expect(tx.user.delete).not.toHaveBeenCalled();
      expect(tx.verificationToken.deleteMany).not.toHaveBeenCalled();
    });

    it('sin otros equipos borra también la cuenta (comportamiento anterior)', async () => {
      const { tx, repository } = build(0);

      await repository.remove(514);

      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u-4' } });
    });
  });

  it('createTeam crea líder, equipo e integrantes en la edición activa', async () => {
    const tx = {
      edition: { findFirst: jest.fn().mockResolvedValue({ id: ACTIVE }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u-4', email: 'lider4@uninorte.edu.co' }]),
        update: jest.fn(),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 77, ...data })),
      },
      subject: { findFirst: jest.fn().mockResolvedValue({ abrevName: 'ABC', semester: 1 }) },
      member: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      nRC: { findMany: jest.fn().mockResolvedValue([{ id: 41, code: 9999, subjectId: 1, subject: { name: 'POO' } }]) },
      videogame: { create: jest.fn().mockResolvedValue({ id: 5 }) },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    const auth = { registerUserTransaction: jest.fn(), sendVerificationEmail: jest.fn() };
    const repository = new TeamRepository(prisma as any, auth as any);

    await repository.createTeam({
      teamName: 'Mismo nombre que en la edición 4',
      isExternal: false,
      members: [member('lider4@uninorte.edu.co', '100'), member('int4@uninorte.edu.co', '200')],
      videogame: { vgName: 'Juego' },
    } as any);

    expect(tx.team.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-4', editionId: ACTIVE }),
    });
    expect(tx.member.create).toHaveBeenCalledTimes(2);
    for (const call of tx.member.create.mock.calls) {
      expect(call[0].data.editionId).toBe(ACTIVE);
    }
    expect(auth.registerUserTransaction).not.toHaveBeenCalled();
    expect(auth.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
