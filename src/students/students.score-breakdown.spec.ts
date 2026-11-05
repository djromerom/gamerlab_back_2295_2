import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { ROLE_IDS } from '../auth/constants/roles';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

/**
 * ARK-154 (HU-30): el estudiante ve solo la nota final de su grupo.
 * - `GET /students` (cada evaluación con puntaje, comentario y criterios) responde 403 al estudiante.
 * - `GET /students/my-judges` sigue mostrando quiénes son sus jurados y si ya evaluaron, sin la nota.
 */
describe('Panel del estudiante sin desglose de notas (ARK-154)', () => {
  describe('GET /students: evaluaciones individuales', () => {
    const handler = StudentsController.prototype.findAll;

    it('usa AdminRoleGuard y ya no el servicio MyEvaluations del estudiante', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      expect(guards).toEqual([AdminRoleGuard]);
      expect(
        Reflect.getMetadata(REQUIRED_SERVICE_KEY, handler),
      ).toBeUndefined();
    });

    const contextFor = (roleId: number) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u', roleId } }),
        }),
      }) as unknown as ExecutionContext;

    const guardWithAdminRole = (adminRoleId: number) => {
      const config = { get: () => undefined };
      const guard = new AdminRoleGuard(
        {} as any,
        {} as any,
        {} as any,
        config as any,
      );
      jest
        .spyOn(guard as any, 'isAdminRole')
        .mockImplementation(async (roleId: unknown) => roleId === adminRoleId);
      return guard;
    };

    it('el estudiante recibe 403', async () => {
      const guard = guardWithAdminRole(ROLE_IDS.ADMIN);
      await expect(
        guard.canActivate(contextFor(ROLE_IDS.STUDENT)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('el administrador pasa', async () => {
      const guard = guardWithAdminRole(ROLE_IDS.ADMIN);
      await expect(guard.canActivate(contextFor(ROLE_IDS.ADMIN))).resolves.toBe(
        true,
      );
    });
  });

  describe('GET /students/my-judges: jurados sin la nota', () => {
    it('sigue con el permiso del estudiante (MyEvaluations)', () => {
      const handler = StudentsController.prototype.getMyJudges;
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        RolePermissionGuard,
      ]);
      expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, handler)).toBe(
        'MyEvaluations',
      );
    });

    const prisma = {
      team: { findFirst: jest.fn() },
      evaluation: { findMany: jest.fn() },
    };
    const service = new StudentsService(prisma as any);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.team.findFirst.mockResolvedValue({
        id: 10,
        videogame: { id: 20 },
        assignedJurors: [
          {
            id: 'j1',
            firstName: 'Ana',
            lastName: 'Ruiz',
            jurorCategory: 'JUNIOR',
            roleId: 4,
            role: { name: 'Jurado' },
          },
          {
            id: 'p1',
            firstName: 'Luis',
            lastName: 'Mora',
            jurorCategory: null,
            roleId: 3,
            role: { name: 'Profesor' },
          },
          {
            id: 'j2',
            firstName: 'Eva',
            lastName: 'Paz',
            jurorCategory: null,
            roleId: 4,
            role: { name: 'Jurado' },
          },
        ],
      });
      // Ana y el profesor ya evaluaron; Eva no
      prisma.evaluation.findMany.mockResolvedValue([
        { jurorId: 'j1' },
        { jurorId: 'p1' },
      ]);
    });

    it('devuelve nombre, categoría y si evaluó; nunca la nota', async () => {
      const judges = await service.getMyJudges('stu');

      expect(judges).toEqual([
        { id: 'j1', nombre: 'Ana Ruiz', categoria: 'JUNIOR', haEvaluado: true },
        {
          id: 'p1',
          nombre: 'Luis Mora',
          categoria: 'PROFESOR',
          haEvaluado: true,
        },
        {
          id: 'j2',
          nombre: 'Eva Paz',
          categoria: 'SIN_CATEGORIA',
          haEvaluado: false,
        },
      ]);
      for (const judge of judges)
        expect(judge).not.toHaveProperty('totalScore');
    });

    it('ni siquiera lee la nota de la base de datos', async () => {
      await service.getMyJudges('stu');
      expect(prisma.evaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { jurorId: true } }),
      );
    });
  });
});
