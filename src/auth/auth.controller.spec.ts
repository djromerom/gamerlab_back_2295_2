import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';

// Smoke test to ensure the controller can be instantiated without errors.
describe('AuthController', () => {
  let controller: AuthController;

  // Mock dependencies with empty objects or jest.fn() as needed. 
  const mockAuthService = {
    getMyProfile: jest.fn(),
    login: jest.fn(),
    outlookLogin: jest.fn(),
    registerUser: jest.fn(),
    invalidateUserProfileCache: jest.fn(),
    resendAuthEmailOfType: jest.fn(),
  };
  const mockJwtStrategy = {};
  const mockReflector = {
    get: jest.fn(),
  };
  const mockPrismaService = {}
  const mockConfigService = {
    get: jest.fn(),
  };
  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: JwtStrategy,
          useValue: mockJwtStrategy,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});