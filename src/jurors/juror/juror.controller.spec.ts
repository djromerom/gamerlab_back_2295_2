import { Test, TestingModule } from '@nestjs/testing';
import { JurorController } from './juror.controller';
import { JurorService } from './juror.service';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { CacheService } from 'src/cache/cache.service';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ConfigService } from '@nestjs/config';

describe('JurorController', () => {
  let controller: JurorController;

  const mockJurorService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    assignEvaluations: jest.fn(),
    getTeams: jest.fn(),
    getJurors: jest.fn(),
    filterEvaluatorsByLevel: jest.fn(),
  };

  const mockJurorAssignmentService = {
    assign: jest.fn(),
    reassign: jest.fn(),
    unassign: jest.fn(),
    unassignAll: jest.fn(),
    unassignAllFromEvaluator: jest.fn(),
    getAuditLog: jest.fn(),
    getEvaluationTracking: jest.fn(),
  };

  const mockAuthService = {
    resendAuthEmailOfType: jest.fn(),
  };

  const mockPrismaService = {};

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
  };

  const mockRolePermissionGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JurorController],
      providers: [
        {
          provide: RolePermissionGuard,
          useValue: mockRolePermissionGuard,
        },
        {
          provide: JurorService,
          useValue: mockJurorService,
        },
        {
          provide: JurorAssignmentService,
          useValue: mockJurorAssignmentService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<JurorController>(JurorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sin hash de contraseña en la respuesta', () => {
    const user = { id: 'j1', email: 'j@x.co', password: '$2b$hash' };

    it('DELETE /juror/:id no devuelve el usuario (204)', async () => {
      mockJurorService.remove.mockResolvedValue(user);
      const result = await controller.softdelete('j1');
      expect(result).toBeUndefined();
      expect(mockJurorService.remove).toHaveBeenCalledWith('j1');
      const status = Reflect.getMetadata(
        '__httpCode__',
        JurorController.prototype.softdelete,
      );
      expect(status).toBe(204);
    });

    it('GET /juror/:id no incluye password', async () => {
      mockJurorService.findOne.mockResolvedValue(user);
      const result = await controller.findOne('j1');
      expect(result).not.toHaveProperty('password');
      expect(result).toMatchObject({ id: 'j1', email: 'j@x.co' });
    });
  });
});
