import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JurorType, JurorCategory } from '@prisma/client';
import { JurorService } from './juror.service';

describe('JurorService', () => {
  let service: JurorService;

  const prismaMock = {
    role: {
      findFirst: jest.fn(),
    },
    videogameStatus: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    team: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    evaluation: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const authMock = {
    registerUser: jest.fn(),
    invalidateUserProfileCache: jest.fn(),
  };

  const auditMock = {
    create: jest.fn(),
  };

  const jurorRoleId = 4;
  const professorRoleId = 3;
  const confirmedStatusId = 1;

  const baseJuror = {
    id: 'juror-1', //random UUID
    email: 'jurado.test@uninorte.edu.co',
    firstName: 'Jurado',
    lastName: 'Prueba',
    roleId: jurorRoleId,
    confirmationStatusId: confirmedStatusId,
    lastSignInAt: null,
    isActive: true,
    jurorCategory: 'Oficial',
    jurorType: 'Junior',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }

      return arg(prismaMock);
    });

    service = new JurorService(
      authMock as any,
      prismaMock as any,
      auditMock as any,
    );

    (service as any).jurorRoleId = jurorRoleId;
    (service as any).professorRoleId = professorRoleId;
    (service as any).confirmedStatusId = confirmedStatusId;
  });

  describe('onModuleInit', () => {
    it('debe inicializar los IDs de rol Jurado, Profesor y estado CONFIRMADO', async () => {
      prismaMock.role.findFirst
        .mockResolvedValueOnce({
          id: jurorRoleId,
          name: 'Jurado',
          isActive: true,
        })
        .mockResolvedValueOnce({
          id: professorRoleId,
          name: 'Profesor',
          isActive: true,
        });

      prismaMock.videogameStatus.findUnique.mockResolvedValueOnce({
        id: confirmedStatusId,
        status: 'CONFIRMADO',
        isActive: true,
      });

      await service.onModuleInit();

      expect((service as any).jurorRoleId).toBe(jurorRoleId);
      expect((service as any).professorRoleId).toBe(professorRoleId);
      expect((service as any).confirmedStatusId).toBe(confirmedStatusId);
      expect(prismaMock.role.findFirst).toHaveBeenCalledTimes(2);
      expect(prismaMock.videogameStatus.findUnique).toHaveBeenCalledTimes(1);
    });

    /*
    it('debe lanzar InternalServerErrorException si no existe el rol Jurado', async () => {
      prismaMock.role.findFirst.mockResolvedValueOnce(null);
      
      await expect(service.onModuleInit()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
    it('debe lanzar InternalServerErrorException si no existe el rol Profesor', async () => {
      prismaMock.role.findFirst
      .mockResolvedValueOnce({
        id: jurorRoleId,
        name: 'Jurado',
        isActive: true,
      })
      .mockResolvedValueOnce(null);
      
      await expect(service.onModuleInit()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
    
    it('debe lanzar InternalServerErrorException si no existe estado CONFIRMADO', async () => {
      prismaMock.role.findFirst
        .mockResolvedValueOnce({
          id: jurorRoleId,
          name: 'Jurado',
          isActive: true,
        })
        .mockResolvedValueOnce({
          id: professorRoleId,
          name: 'Profesor',
          isActive: true,
        });
        
        prismaMock.videogameStatus.findUnique.mockResolvedValueOnce(null);
        
        await expect(service.onModuleInit()).rejects.toThrow(
          InternalServerErrorException,
        );
    });
      */
  });

  describe('create', () => {
    it('debe crear un jurado, actualizar sus datos y devolver JurorListItem', async () => {
      authMock.registerUser.mockResolvedValueOnce({
        id: baseJuror.id,
        email: baseJuror.email,
      });

      prismaMock.user.update.mockResolvedValueOnce(baseJuror);

      prismaMock.evaluation.findMany.mockResolvedValueOnce([
        {
          videogame: {
            id: 1,
            name: 'Juego Evaluado',
          },
        },
      ]);

      prismaMock.team.findMany.mockResolvedValueOnce([
        {
          videogame: {
            id: 1,
            name: 'Juego Evaluado',
          },
        },
        {
          videogame: {
            id: 2,
            name: 'Juego Pendiente',
          },
        },
      ]);

      const result = await service.create({
        firstName: 'Jurado',
        lastName: 'Prueba',
        email: baseJuror.email,
        jurorCategory: 'JUNIOR',
        jurorType: 'OFFICIAL',
      });

      expect(authMock.registerUser).toHaveBeenCalledWith({
        email: baseJuror.email,
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: {
          id: baseJuror.id,
        },
        data: {
          firstName: 'Jurado',
          lastName: 'Prueba',
          roleId: jurorRoleId,
          isActive: true,
        },
      });

      expect(result).toEqual({
        id: baseJuror.id,
        firstName: baseJuror.firstName,
        lastName: baseJuror.lastName,
        email: baseJuror.email,
        confirmationStatusId: baseJuror.confirmationStatusId,
        lastSignInAt: baseJuror.lastSignInAt,
        evaluatedCount: 1,
        evaluatedGameNames: ['Juego Evaluado'],
        unevaluatedCount: 1,
        unevaluatedGameNames: ['Juego Pendiente'],
      });
    });

    it('debe lanzar InternalServerErrorException si registerUser no devuelve id', async () => {
      authMock.registerUser.mockResolvedValueOnce({
        email: baseJuror.email,
      });

      await expect(
        service.create({
          firstName: 'Jurado',
          lastName: 'Prueba',
          email: baseJuror.email,
          jurorCategory: 'JUNIOR',
          jurorType: 'OFFICIAL',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('debe lanzar InternalServerErrorException si falla la actualización del usuario', async () => {
      authMock.registerUser.mockResolvedValueOnce({
        id: baseJuror.id,
        email: baseJuror.email,
      });

      prismaMock.user.update.mockRejectedValueOnce(
        new Error('Database update error'),
      );

      await expect(
        service.create({
          firstName: 'Jurado',
          lastName: 'Prueba',
          email: baseJuror.email,
          jurorCategory: 'JUNIOR',
          jurorType: 'OFFICIAL',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findAll', () => {
    it('debe listar jurados paginados con juegos evaluados y pendientes', async () => {
      const userWithEvaluations = {
        ...baseJuror,
        evaluationsSubmitted: [
          {
            videogame: {
              id: 1,
              name: 'Juego Evaluado',
            },
          },
        ],
      };

      prismaMock.user.findMany.mockResolvedValueOnce([userWithEvaluations]);
      prismaMock.user.count.mockResolvedValueOnce(1);
      prismaMock.team.findMany.mockResolvedValueOnce([
        {
          videogame: {
            id: 1,
            name: 'Juego Evaluado',
          },
          assignedJurors: [
            {
              id: baseJuror.id,
            },
          ],
        },
        {
          videogame: {
            id: 2,
            name: 'Juego Pendiente',
          },
          assignedJurors: [
            {
              id: baseJuror.id,
            },
          ],
        },
      ]);

      const result = await service.findAll(false, 10, 1);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(baseJuror.id);
      expect(result.data[0].evaluatedGameNames).toEqual(['Juego Evaluado']);
      expect(result.data[0].unevaluatedGameNames).toEqual(['Juego Pendiente']);

      expect(result.metadata).toEqual({
        totalItems: 1,
        itemsOnCurrentPage: 1,
        currentPage: 1,
        itemsPerPage: 10,
        totalPages: 1,
      });
    });
  });

  describe('findOne', () => {
    it('debe devolver un jurado activo por id', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(baseJuror);

      const result = await service.findOne(baseJuror.id);

      expect(result).toEqual(baseJuror);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          id: baseJuror.id,
        },
      });
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar NotFoundException si el usuario no es jurado', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        ...baseJuror,
        roleId: professorRoleId,
      });

      await expect(service.findOne(baseJuror.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar NotFoundException si el jurado está inactivo', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        ...baseJuror,
        isActive: false,
      });

      await expect(service.findOne(baseJuror.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('debe actualizar un jurado e invalidar caché', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(baseJuror)
        .mockResolvedValueOnce(null);

      const updatedJuror = {
        ...baseJuror,
        firstName: 'Jurado Actualizado',
        email: 'jurado.actualizado@uninorte.edu.co',
      };

      prismaMock.user.update.mockResolvedValueOnce(updatedJuror);

      prismaMock.evaluation.findMany.mockResolvedValueOnce([]);
      prismaMock.team.findMany.mockResolvedValueOnce([]);

      const result = await service.update(baseJuror.id, {
        firstName: 'Jurado Actualizado',
        email: 'jurado.actualizado@uninorte.edu.co',
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: {
          id: baseJuror.id,
        },
        data: {
          firstName: 'Jurado Actualizado',
          email: 'jurado.actualizado@uninorte.edu.co',
        },
      });

      expect(authMock.invalidateUserProfileCache).toHaveBeenCalledWith(
        baseJuror.id,
      );

      expect(result.firstName).toBe('Jurado Actualizado');
      expect(result.email).toBe('jurado.actualizado@uninorte.edu.co');
    });

    it('debe lanzar ConflictException si el correo ya pertenece a otro usuario', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(baseJuror)
        .mockResolvedValueOnce({
          id: 'otro-user-id',
          email: 'repetido@uninorte.edu.co',
        });

      await expect(
        service.update(baseJuror.id, {
          email: 'repetido@uninorte.edu.co',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe('remove (borrado lógico)', () => {
    const deactivated = { ...baseJuror, isActive: false };

    it('no llama a prisma.user.delete', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(baseJuror);
      prismaMock.user.update.mockResolvedValueOnce(deactivated);

      await service.remove(baseJuror.id);

      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it('hace update({ isActive: false }) y devuelve el usuario desactivado', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(baseJuror);
      prismaMock.user.update.mockResolvedValueOnce(deactivated);

      const result = await service.remove(baseJuror.id);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: baseJuror.id },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('invalida la caché del perfil', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(baseJuror);
      prismaMock.user.update.mockResolvedValueOnce(deactivated);

      await service.remove(baseJuror.id);

      expect(authMock.invalidateUserProfileCache).toHaveBeenCalledWith(
        baseJuror.id,
      );
    });

    it('lanza 404 si el usuario no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.remove('no-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('lanza 404 si el usuario es de otro rol', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        ...baseJuror,
        roleId: 99,
      });

      await expect(service.remove(baseJuror.id)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('no lanza error con un jurado que ya calificó (el delete fallaría por FK)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(baseJuror);
      prismaMock.user.delete.mockRejectedValue(
        new Error('Foreign key constraint failed'),
      );
      prismaMock.user.update.mockResolvedValueOnce(deactivated);

      await expect(service.remove(baseJuror.id)).resolves.toEqual(deactivated);
    });

    it('findOne de un jurado desactivado lanza 404', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(deactivated);

      await expect(service.findOne(baseJuror.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('el listado de jurados filtra isActive: true', async () => {
      prismaMock.user.findMany.mockResolvedValueOnce([]);
      prismaMock.user.count.mockResolvedValueOnce(0);
      prismaMock.team.findMany.mockResolvedValueOnce([]);

      await service.findAll(true, 10, 1);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('getEvaluatorsWithTeams', () => {
    it('debe agrupar jurados con sus equipos asignados', async () => {
      prismaMock.team.findMany.mockResolvedValueOnce([
        {
          id: 1,
          teamName: 'Equipo AYP Dev',
          videogame: {
            id: 1,
            name: 'Juego AYP',
          },
          assignedJurors: [
            {
              id: baseJuror.id,
              firstName: baseJuror.firstName,
              lastName: baseJuror.lastName,
              email: baseJuror.email,
              role: {
                name: 'Jurado',
              },
            },
          ],
        },
        {
          id: 2,
          teamName: 'Equipo AYP2 Dev',
          videogame: {
            id: 2,
            name: 'Juego AYP2',
          },
          assignedJurors: [
            {
              id: baseJuror.id,
              firstName: baseJuror.firstName,
              lastName: baseJuror.lastName,
              email: baseJuror.email,
              role: {
                name: 'Jurado',
              },
            },
          ],
        },
      ]);

      const result = await service.getEvaluatorsWithTeams();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: baseJuror.id,
        nombre: 'Jurado Prueba',
        tipo: 'Jurado',
        email: baseJuror.email,
        equiposAsignados: [
          {
            id: 1,
            nombre: 'Equipo AYP Dev',
            videojuego: 'Juego AYP',
          },
          {
            id: 2,
            nombre: 'Equipo AYP2 Dev',
            videojuego: 'Juego AYP2',
          },
        ],
        cantidadEquipos: 2,
      });
    });
  });

  describe('getTeamsAssignedToJuror', () => {
    it('debe devolver los equipos asignados a un jurado', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        ...baseJuror,
        role: {
          name: 'Jurado',
        },
      });

      prismaMock.team.findMany.mockResolvedValueOnce([
        {
          id: 1,
          teamName: 'Equipo AYP Dev',
          videogame: {
            id: 1,
            name: 'Juego AYP',
            description: 'Videojuego AYP dev',
          },
          user: {
            id: 'leader-1',
            firstName: 'Líder',
            lastName: 'Equipo',
            email: 'lider@uninorte.edu.co',
          },
          assignedJurors: [
            {
              id: baseJuror.id,
              firstName: baseJuror.firstName,
              lastName: baseJuror.lastName,
              email: baseJuror.email,
            },
          ],
        },
      ]);

      const result = await service.getTeamsAssignedToJuror(baseJuror.id);

      expect(result).toEqual([
        {
          id: 1,
          nombre: 'Equipo AYP Dev',
          videojuego: {
            id: 1,
            nombre: 'Juego AYP',
            descripcion: 'Videojuego AYP dev',
          },
          lider: {
            id: 'leader-1',
            nombre: 'Líder Equipo',
            email: 'lider@uninorte.edu.co',
          },
          juradosAsignados: [
            {
              id: baseJuror.id,
              nombre: 'Jurado Prueba',
              email: baseJuror.email,
            },
          ],
          cantidadJurados: 1,
        },
      ]);
    });

    it('debe lanzar NotFoundException si el jurado no existe o está inactivo', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getTeamsAssignedToJuror('no-existe'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar error si el usuario no es jurado', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        ...baseJuror,
        roleId: professorRoleId,
        role: {
          name: 'Profesor',
        },
      });

      await expect(
        service.getTeamsAssignedToJuror(baseJuror.id),
      ).rejects.toThrow('El usuario no es un jurado');
    });
  });

  describe('getTeamEvaluationStats', () => {
    it('debe devolver cantidad de jurados asignados y jurados que evaluaron', async () => {
      prismaMock.team.findUnique.mockResolvedValueOnce({
        id: 1,
        videogame: {
          id: 10,
        },
        assignedJurors: [
          {
            id: 'juror-1',
          },
          {
            id: 'juror-2',
          },
        ],
      });

      prismaMock.evaluation.count.mockResolvedValueOnce(1);

      const result = await service.getTeamEvaluationStats(1);

      expect(result).toEqual({
        totalJurorsAssigned: 2,
        jurorsWhoEvaluated: 1,
      });

      expect(prismaMock.evaluation.count).toHaveBeenCalledWith({
        where: {
          videogameId: 10,
          jurorId: {
            in: ['juror-1', 'juror-2'],
          },
          isActive: true,
        },
      });
    });

    it('debe devolver 0 evaluaciones si el equipo no tiene videojuego', async () => {
      prismaMock.team.findUnique.mockResolvedValueOnce({
        id: 1,
        videogame: null,
        assignedJurors: [
          {
            id: 'juror-1',
          },
        ],
      });

      const result = await service.getTeamEvaluationStats(1);

      expect(result).toEqual({
        totalJurorsAssigned: 1,
        jurorsWhoEvaluated: 0,
      });

      expect(prismaMock.evaluation.count).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si el equipo no existe', async () => {
      prismaMock.team.findUnique.mockResolvedValueOnce(null);

      await expect(service.getTeamEvaluationStats(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
