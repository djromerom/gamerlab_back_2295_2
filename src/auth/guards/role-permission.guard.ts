// src/auth/guards/role-permission.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  Logger,
  InternalServerErrorException,
  UnauthorizedException, // Import if needed for specific errors
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_SERVICE_KEY } from '../decorators/required-service.decorator';
import { AppUser } from '../supabase.strategy';

@Injectable()
export class RolePermissionGuard implements CanActivate {
  private readonly logger = new Logger(RolePermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Get required service name from decorator
    const requiredServiceName =
      this.reflector.get<string>(REQUIRED_SERVICE_KEY, context.getHandler()) ??
      this.reflector.get<string>(REQUIRED_SERVICE_KEY, context.getClass());

    if (!requiredServiceName) {
      this.logger.warn(
        `Route accessed without @RequiredService decorator. Access denied.`,
      );
      throw new InternalServerErrorException(
        'Configuration Error: Missing @RequiredService decorator on protected route.',
      );
    }

    // 2. Get user object from request
    const request = context.switchToHttp().getRequest();
    const user = request.user as AppUser;

    if (user?.roleId === undefined || user?.roleId === null) {
      this.logger.error(
        "RolePermissionGuard: User object on request is missing or does not contain required 'roleId' property.",
      );
      throw new UnauthorizedException(
        'User context incomplete for permission check.',
      );
    }

    const userRoleId = user.roleId;
    const userId = user.id;

    try {
      const service = await this.prisma.service.findUnique({
        where: {
          name: requiredServiceName,
          isActive: true,
        },
        select: { id: true },
      });

      if (!service) {
        this.logger.warn(
          `Service '${requiredServiceName}' not found in DB or is inactive.`,
        );
        // If the required service config doesn't exist, it's a server/config error
        throw new NotFoundException(
          `Required service configuration '${requiredServiceName}' not found or is inactive.`,
        );
      }
      const serviceId = service.id;

      // 5. Find permissions required for this Service using Prisma model/field names
      const requiredPermissions = await this.prisma.servicePermission.findMany({
        where: {
          serviceId: serviceId,
          isActive: true,
          permission: {
            isActive: true,
          },
        },
        select: { permissionId: true },
      });

      // If no permissions are explicitly required BY THE SERVICE MAPPING, allow access
      if (requiredPermissions.length === 0) {
        this.logger.log(
          `Service '${requiredServiceName}' (ID: ${serviceId}) requires no specific permissions mapped via ServicePermission. Allowing access for authenticated user ${userId}.`,
        );
        return true;
      }
      const requiredPermissionIds = requiredPermissions.map(
        (p) => p.permissionId,
      );

      // 6. Find permissions granted to the User's Role
      const grantedPermissions = await this.prisma.rolePermission.findMany({
        where: {
          roleId: userRoleId,
          isActive: true,
          permission: {
            isActive: true,
          },
        },
        select: { permissionId: true },
      });
      const grantedPermissionIds = grantedPermissions.map(
        (p) => p.permissionId,
      );

      // 7. Check if user's role has AT LEAST ONE of the required permissions
      const hasPermission = requiredPermissionIds.some((requiredId) =>
        grantedPermissionIds.includes(requiredId),
      );

      if (!hasPermission) {
        this.logger.warn(
          `Permission DENIED for User ${userId} (Role ID: ${userRoleId}) accessing service '${requiredServiceName}'. Required: [${requiredPermissionIds.join(', ')}], Granted: [${grantedPermissionIds.join(', ')}]`,
        );
        throw new ForbiddenException(
          'You do not have permission to access this resource.',
        );
      }

      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        this.logger.warn(
          `Guard denying access due to thrown ${error.constructor.name}: ${error.message}`,
        );
        this.logger.debug(
          '--- RolePermissionGuard canActivate END (Denied via Exception) ---',
        );
        throw error;
      }
      this.logger.error(
        `Unexpected error during permission check for User ${userId}, Role ${userRoleId}, Service '${requiredServiceName}': ${error.message}`,
        error.stack,
      );
      this.logger.debug(
        '--- RolePermissionGuard canActivate END (Denied via Unexpected Error) ---',
      );
      throw new InternalServerErrorException(
        'An error occurred while checking permissions.',
      );
    }
  }
}
