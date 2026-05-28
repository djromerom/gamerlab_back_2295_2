import { Test, TestingModule } from '@nestjs/testing';
import { CriterionController } from './criterion.controller';
import { CriterionService } from './criterion.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from 'src/cache/cache.service';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

describe('CriterionController', () => {
  let controller: CriterionController;

  const mockCriterionService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findForSelect: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
  }; // Mocked CriterionService

  const mockPrismaService = {};

  const mockCacheService = {};

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRolePermissionGuard = {
    canActivate: jest.fn().mockReturnValue(true), // Allow all for testing
  };
  
  const mockReflector = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CriterionController],
      providers: [
        {
          provide: RolePermissionGuard,
          useValue: mockRolePermissionGuard,
        },
        {
          provide: CriterionService,
          useValue: mockCriterionService,
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
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<CriterionController>(CriterionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
