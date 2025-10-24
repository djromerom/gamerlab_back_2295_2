import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Observable } from 'rxjs';

/*
 This is a custom JwtAuthGuard (formerly SupabaseAuthGuard). The idea is that we can use both @Public and @UseGuards(RolePermissionGuard)
 @RequiredService('GetSecretData') so we can define public routes and routes that require authentication.
*/
@Injectable()
export class SupabaseAuthGuard extends AuthGuard('supabase') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Otherwise, proceed with the local JWT authentication flow
    // This calls the canActivate method of the parent AuthGuard('supabase')
    return super.canActivate(context);
  }
}