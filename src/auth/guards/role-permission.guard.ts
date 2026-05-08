import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { REQUIRED_SERVICE_KEY } from '../decorators/required-service.decorator';
import { AppUser } from '../jwt.strategy';
import { CacheService } from 'src/cache/cache.service';

interface CachedServiceConfig {
  serviceId: string;
  requiredPermissionIds: number[];
  requiresNoPermissions: boolean;
}

interface CachedUserPermissions {
  roleId: number;
  grantedPermissionIds: number[];
}

@Injectable()
export class RolePermissionGuard implements CanActivate {
  private readonly logger = new Logger(RolePermissionGuard.name);

  //TODO: Move these to it's own `config` file
  private readonly SERVICE_CONFIG_CACHE_TTL: number;
  private readonly USER_PERMISSIONS_CACHE_TTL: number;
  private readonly PERMISSION_CHECK_CACHE_TTL: number;
  private readonly ADMIN_ROLE_NAME: string;

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.SERVICE_CONFIG_CACHE_TTL = this.configService.get<number>(
      'CACHE_SERVICE_CONFIG_TTL_MINUTES',
      120, // 2 hours default
    ) * 60 * 1000;
    this.USER_PERMISSIONS_CACHE_TTL = this.configService.get<number>(
      'CACHE_USER_PERMISSIONS_TTL_MINUTES',
      60, // 1 hour default
    ) * 60 * 1000;
    this.PERMISSION_CHECK_CACHE_TTL = this.configService.get<number>(
      'CACHE_PERMISSION_CHECK_TTL_MINUTES',
      30, // 30 minutes default
    ) * 60 * 1000;
    this.ADMIN_ROLE_NAME = this.configService.get<string>('ADMIN_ROLE_NAME', 'Administrador');

    this.logger.log(
      `Permission cache TTLs initialized - Service Config: ${this.SERVICE_CONFIG_CACHE_TTL}s, User Permissions: ${this.USER_PERMISSIONS_CACHE_TTL}s, Permission Check: ${this.PERMISSION_CHECK_CACHE_TTL}s`,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredServiceName =
      this.reflector.get<string>(REQUIRED_SERVICE_KEY, context.getHandler()) ??
      this.reflector.get<string>(REQUIRED_SERVICE_KEY, context.getClass());

    if (!requiredServiceName) {
      this.logger.warn(`Route accessed without @RequiredService decorator. Access denied.`);
      throw new InternalServerErrorException(
        'Configuration Error: Missing @RequiredService decorator on protected route.',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AppUser;

    if (user?.roleId === undefined || user?.roleId === null) {
      this.logger.error(
        "RolePermissionGuard: User object on request is missing or does not contain required 'roleId' property.",
      );
      throw new UnauthorizedException('User context incomplete for permission check.');
    }

    const userRoleId = user.roleId;
    const userId = user.id;

    try {
      // Check if user is admin - admins bypass all permission checks
      const isAdmin = await this.isAdminRole(userRoleId);
      if (isAdmin) {
        this.logger.log(
          `Admin access granted for User ${userId} (Role ID: ${userRoleId}) accessing service '${requiredServiceName}'. Admin bypasses all permission checks.`,
        );
        return true;
      }

      const permissionCacheKey = this.getPermissionCheckCacheKey(userRoleId, requiredServiceName);
      const cachedResult = await this.cacheService.get(permissionCacheKey);

      if (cachedResult !== null && cachedResult !== undefined) {
        this.logger.log(
          `Permission cache hit for User ${userId} (Role: ${userRoleId}) accessing service '${requiredServiceName}': ${cachedResult}`,
        );

        if (!cachedResult) {
          throw new ForbiddenException('You do not have permission to access this resource.');
        }
        return cachedResult;
      }

      const serviceConfig = await this.getServiceConfig(requiredServiceName);

      if (serviceConfig.requiresNoPermissions) {
        this.logger.log(
          `Service '${requiredServiceName}' requires no specific permissions. Allowing access for user ${userId}.`,
        );
        await this.cacheService.set(permissionCacheKey, true, this.PERMISSION_CHECK_CACHE_TTL);
        return true;
      }

      const userPermissions = await this.getUserPermissions(userRoleId);

      const hasPermission = serviceConfig.requiredPermissionIds.some((requiredId) =>
        userPermissions.grantedPermissionIds.includes(requiredId),
      );

      await this.cacheService.set(permissionCacheKey, hasPermission, this.PERMISSION_CHECK_CACHE_TTL);

      if (!hasPermission) {
        this.logger.warn(
          `Permission DENIED for User ${userId} (Role ID: ${userRoleId}) accessing service '${requiredServiceName}'. Required: [${serviceConfig.requiredPermissionIds.join(', ')}], Granted: [${userPermissions.grantedPermissionIds.join(', ')}]`,
        );
        throw new ForbiddenException('You do not have permission to access this resource.');
      }

      this.logger.log(
        `Permission GRANTED for User ${userId} (Role ID: ${userRoleId}) accessing service '${requiredServiceName}'.`,
      );
      return true;

    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(
          `Unexpected error during permission check for User ${userId}, Role ${userRoleId}, Service '${requiredServiceName}': ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException('An error occurred while checking permissions.');
      }
    }

    return true;
  }

  /**
   * Check if the role is an admin role with caching
   */
  private async isAdminRole(roleId: number): Promise<boolean> {
    const cacheKey = this.getAdminRoleCacheKey(roleId);

    let isAdmin = await this.cacheService.get(cacheKey);
    if (isAdmin !== null && isAdmin !== undefined) {
      this.logger.debug(`Admin role cache hit for role: ${roleId}`);
      return isAdmin;
    }

    this.logger.debug(`Admin role cache miss for role: ${roleId}`);

    const role = await this.prisma.role.findUnique({
      where: {
        id: roleId,
        isActive: true,
      },
      select: { 
        name: true 
      },
    });

    // Check if role name is "Administrador" (case insensitive)
    isAdmin = role?.name?.toLowerCase() === this.ADMIN_ROLE_NAME.toLowerCase();

    await this.cacheService.set(cacheKey, isAdmin, this.USER_PERMISSIONS_CACHE_TTL);
    this.logger.debug(`Admin role cached for role: ${roleId} - isAdmin: ${isAdmin}`);

    return isAdmin;
  }

  /**
   * Get service configuration with caching
   */
  private async getServiceConfig(serviceName: string): Promise<CachedServiceConfig> {
    const cacheKey = this.getServiceConfigCacheKey(serviceName);

    let serviceConfig = await this.cacheService.get(cacheKey);
    if (serviceConfig) {
      this.logger.debug(`Service config cache hit for: ${serviceName}`);
      return serviceConfig;
    }

    this.logger.debug(`Service config cache miss for: ${serviceName}`);

    const service = await this.prisma.service.findUnique({
      where: {
        name: serviceName,
        isActive: true,
      },
      select: { id: true },
    });

    if (!service) {
      this.logger.warn(`Service '${serviceName}' not found in DB or is inactive.`);
      throw new NotFoundException(
        `Required service configuration '${serviceName}' not found or is inactive.`,
      );
    }

    const requiredPermissions = await this.prisma.servicePermission.findMany({
      where: {
        serviceId: service.id,
        isActive: true,
        permission: {
          isActive: true,
        },
      },
      select: { permissionId: true },
    });

    serviceConfig = {
      serviceId: service.id,
      requiredPermissionIds: requiredPermissions.map((p) => p.permissionId),
      requiresNoPermissions: requiredPermissions.length === 0,
    };

    await this.cacheService.set(cacheKey, serviceConfig, this.SERVICE_CONFIG_CACHE_TTL);
    this.logger.debug(`Service config cached for: ${serviceName}`);

    return serviceConfig;
  }

  /**
   * Get user permissions with caching
   */
  private async getUserPermissions(roleId: number): Promise<CachedUserPermissions> {
    const cacheKey = this.getUserPermissionsCacheKey(roleId);

    let userPermissions = await this.cacheService.get(cacheKey);
    if (userPermissions) {
      this.logger.debug(`User permissions cache hit for role: ${roleId}`);
      return userPermissions;
    }

    this.logger.debug(`User permissions cache miss for role: ${roleId}`);

    const grantedPermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: roleId,
        isActive: true,
        permission: {
          isActive: true,
        },
      },
      select: { permissionId: true },
    });

    userPermissions = {
      roleId,
      grantedPermissionIds: grantedPermissions.map((p) => p.permissionId),
    };

    await this.cacheService.set(cacheKey, userPermissions, this.USER_PERMISSIONS_CACHE_TTL);
    this.logger.debug(`User permissions cached for role: ${roleId}`);

    return userPermissions;
  }

  private getServiceConfigCacheKey(serviceName: string): string {
    return `service_config:${serviceName}`;
  }

  private getUserPermissionsCacheKey(roleId: number): string {
    return `user_permissions:role_${roleId}`;
  }

  private getAdminRoleCacheKey(roleId: number): string {
    return `admin_role:role_${roleId}`;
  }

  private getPermissionCheckCacheKey(roleId: number, serviceName: string): string {
    return `permission_check:role_${roleId}:service_${serviceName}`;
  }

  async invalidateServiceCache(serviceName: string): Promise<void> {
    const serviceKey = this.getServiceConfigCacheKey(serviceName);
    await this.cacheService.delete(serviceKey);
    this.logger.log(`Invalidated service config cache for: ${serviceName}`);
  }

  async invalidateRolePermissionsCache(roleId: number): Promise<void> {
    const roleKey = this.getUserPermissionsCacheKey(roleId);
    await this.cacheService.delete(roleKey);
    this.logger.log(`Invalidated role permissions cache for role: ${roleId}`);
  }

  /**
   * Invalidates the cached admin role status for a specific role.
   * Should be called when a role's name or active status changes.
   * @param roleId - The ID of the role to invalidate
   */
  async invalidateAdminRoleCache(roleId: number): Promise<void> {
    const adminKey = this.getAdminRoleCacheKey(roleId);
    await this.cacheService.delete(adminKey);
    this.logger.log(`Invalidated admin role cache for role: ${roleId}`);
  }

  /**
   * Invalidate all caches associated with a given role.
   *
   * This method concurrently triggers invalidation for:
   * - the role permissions cache,
   * - the admin role cache,
   * - the permission check cache.
   *
   * After all invalidation operations complete, an informational log entry is written.
   *
   * @param roleId - The unique numeric identifier of the role whose caches should be invalidated.
   */
  async invalidateAllRoleCaches(roleId: number): Promise<void> {
    await Promise.all([
      this.invalidateRolePermissionsCache(roleId),
      this.invalidateAdminRoleCache(roleId),
      this.invalidatePermissionCheckCache(roleId),
    ]);
    this.logger.log(`Invalidated all role caches for role: ${roleId}`);
  }

  /**
   * Invalidates the cached permission check for a given role and, optionally, a specific service.
   *
   * If a service name is provided, the method computes the cache key for the role-service pair,
   * deletes that entry from the cache via `cacheService.delete(...)`, and logs the invalidation.
   * If no service name is provided, the method logs that all permission checks for the given role
   * should be invalidated (bulk invalidation is not performed by this method).
   *
   * @param roleId - The identifier of the role whose permission check cache should be invalidated.
   * @param serviceName - Optional name of the service to target a single permission-check cache entry.
   *                      When omitted, the function indicates that all permission checks for the role
   *                      need invalidation.
   */
  async invalidatePermissionCheckCache(roleId: number, serviceName?: string): Promise<void> {
    if (serviceName) {
      const permissionKey = this.getPermissionCheckCacheKey(roleId, serviceName);
      await this.cacheService.delete(permissionKey);
      this.logger.log(`Invalidated permission check cache for role ${roleId}, service ${serviceName}`);
    } else {
      this.logger.log(`Would need to invalidate all permission checks for role: ${roleId}`);
    }
  }
}
