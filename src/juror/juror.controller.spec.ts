import { Test, TestingModule } from '@nestjs/testing';
import { JurorController } from './juror.controller';
import { JurorService } from './juror.service';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../cache/cache.service';
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
});