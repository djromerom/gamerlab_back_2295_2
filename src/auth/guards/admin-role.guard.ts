import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RolePermissionGuard } from './role-permission.guard';
import { AppUser } from '../jwt.strategy';

export const IS_ADMIN_KEY = 'isAdmin';

/*
 Allows the route only to the administrator role (ADMIN_ROLE_NAME).
 Used for data with emails and student codes, because in the seeded roles
 the Estudiante role holds ListTeams / GetTeam (BG-02).
*/
@Injectable()
export class AdminRoleGuard extends RolePermissionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user as AppUser | undefined;
    if (user?.roleId === undefined || user?.roleId === null) {
      throw new UnauthorizedException('User context incomplete for permission check.');
    }
    if (!(await this.isAdminRole(user.roleId))) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }
    return true;
  }
}

/*
 Non-blocking version for @Public routes, meant to run after OptionalJwtAuthGuard.
 It never denies access: it stores in request[IS_ADMIN_KEY] whether the caller is an
 administrator, so the handler can decide whether to include personal data.
 Read it with the @IsAdmin() decorator.
*/
@Injectable()
export class OptionalAdminRoleGuard extends RolePermissionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AppUser | undefined;
    request[IS_ADMIN_KEY] =
      user?.roleId !== undefined && user?.roleId !== null && (await this.isAdminRole(user.roleId));
    return true;
  }
}
