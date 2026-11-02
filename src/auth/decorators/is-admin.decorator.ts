import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IS_ADMIN_KEY } from '../guards/admin-role.guard';

/**
 * Returns true when OptionalAdminRoleGuard found that the caller is an administrator.
 * Returns false for anonymous callers and any other role.
 *
 * @example
 * @Public()
 * @UseGuards(OptionalJwtAuthGuard, OptionalAdminRoleGuard)
 * async myHandler(@IsAdmin() isAdmin: boolean) { ... }
 */
export const IsAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): boolean => {
  return ctx.switchToHttp().getRequest()[IS_ADMIN_KEY] === true;
});
