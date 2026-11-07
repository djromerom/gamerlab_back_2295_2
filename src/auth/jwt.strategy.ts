import {
  Injectable,
  UnauthorizedException,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './types/jwt-payload.type';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { AuthService, SESSION_CHECK_UNAVAILABLE_MESSAGE } from './auth.service';
import { Request } from 'express';
import { StrategyOptionsWithRequest } from 'passport-jwt';

const ACCESS_TOKEN_COOKIE = 'access-token';

export type AppUser = User & { user?: JwtPayload };

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
  'jwt',
) {
  private readonly logger = new Logger(JwtStrategy.name);

  public constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined. JWT strategy cannot be initialized.');
    }

    super({
      secretOrKey: jwtSecret,
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.extractJWTFromCookie,
      ]),
      ignoreExpiration: false,
    } as StrategyOptionsWithRequest);
  }

  private static extractJWTFromCookie(req: Request): string | null {
    let token = null;
    if (req && req.cookies) {
      token = req.cookies[ACCESS_TOKEN_COOKIE];
    }
    return token;
  }

  /**
   * Validates the JWT payload AFTER passport-jwt verifies the signature and expiration.
   * It receives the decoded payload.
   * Then, syncs/validates against the local database using AuthService.
   *
   * @param payload The decoded JWT payload. Type hint with JwtPayload or user.
   * @returns The User object (from Prisma) to be attached to request.user.
   */
  async validate(payload: JwtPayload): Promise<AppUser> {
    if (!payload.sub) {
      this.logger.warn('VALIDATE - JWT payload missing "sub" (user ID)');
      throw new UnauthorizedException('Invalid token payload (missing sub)');
    }

    // A refresh token must never work as an access token.
    if (payload.type === 'refresh') {
      this.logger.warn('VALIDATE - Refresh token used as access token');
      throw new UnauthorizedException('Invalid token type.');
    }

    let user: User | null = null;
    try {
      this.logger.debug(`VALIDATE - Calling syncLocalUser for user: ${payload.sub}`);
      user = await this.authService.syncLocalUser(payload);
      this.logger.debug(`VALIDATE - syncLocalUser returned successfully`);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`VALIDATE - User ${payload.sub} not found locally.`);
        throw new UnauthorizedException(`User profile not found.`);
      }
      if (error instanceof UnauthorizedException) {
        this.logger.warn(
          `VALIDATE - User ${payload.sub} is inactive or unauthorized.`,
        );
        throw error;
      }
      // ARK-190: a server failure (database, pool) is not an invalid session. A 401 here made the
      // front try to refresh and, if that failed too, expelled the user over a passing failure.
      this.logger.error(
        `VALIDATE - Could not load user ${payload.sub}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(SESSION_CHECK_UNAVAILABLE_MESSAGE);
    }

    if (!user) {
      this.logger.error(
        `VALIDATE - syncLocalUser returned null/undefined unexpectedly for sub: ${payload.sub}`,
      );
      throw new InternalServerErrorException(
        'User synchronization failed unexpectedly.',
      );
    }

    this.logger.log(`VALIDATE - User ${user.email} validated successfully.`);

    const appUser: AppUser = {
      ...user,
      user: payload,
    };
    return appUser;
  }
}
