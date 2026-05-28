import { Test, TestingModule } from '@nestjs/testing';
import { NrcsController } from './nrcs.controller';
import { NrcsService } from './nrcs.service';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from 'src/cache/cache.service';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

describe('NrcsController', () => {
  let controller: NrcsController;

  const mockNrcsService = {
    findAll: jest.fn(),
    findForSelect: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockRolePermissionGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const mockPrismaService = {};

  const mockCacheService = {};

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockReflector = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NrcsController],
      providers: [
        {
          provide: RolePermissionGuard,
          useValue: mockRolePermissionGuard,
        },
        {
          provide: NrcsService,
          useValue: mockNrcsService,
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
        {
          provide: Reflector,
          useValue: mockReflector,
        }
      ],
    }).compile();

    controller = module.get<NrcsController>(NrcsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
