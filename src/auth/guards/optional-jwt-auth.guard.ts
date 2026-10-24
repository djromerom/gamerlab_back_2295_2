import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/*
 Guard for @Public routes that return more data to authenticated users.
 It tries the JWT cookie and attaches request.user when it is valid,
 but never rejects the request: anonymous callers continue with request.user = undefined.
*/
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) {
      return undefined as TUser;
    }
    return user as TUser;
  }
}
