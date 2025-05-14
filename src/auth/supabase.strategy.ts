import {
  Injectable,
  UnauthorizedException,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { Request } from 'express';
import { StrategyOptionsWithRequest } from 'passport-jwt';
import { SupabaseAuthUser as SupabaseUser } from 'nestjs-supabase-auth';

const ACCESS_TOKEN_COOKIE = 'access-token';

interface JwtPayload {
  sub: string;
  email?: string;
  aud?: string;
  role?: string;
}

export type AppUser = User & { supabaseUser?: JwtPayload };

@Injectable()
export class SupabaseStrategy extends PassportStrategy(
  JwtStrategy,
  'supabase',
) {
  private readonly logger = new Logger(SupabaseStrategy.name);

  public constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const supabaseJwtSecret = configService.get<string>('SUPABASE_JWT_SECRET');

    if (!supabaseJwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is not defined. JWT strategy cannot be initialized.');
    }

    super({
      secretOrKey: supabaseJwtSecret,
      jwtFromRequest: ExtractJwt.fromExtractors([
        SupabaseStrategy.extractJWTFromCookie,
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
   * @param payload The decoded JWT payload. Type hint with JwtPayload or SupabaseUser.
   * @returns The User object (from Prisma) to be attached to request.user.
   */
  async validate(payload: JwtPayload): Promise<AppUser> {
    if (!payload.sub) {
      this.logger.warn('VALIDATE - JWT payload missing "sub" (user ID)');
      throw new UnauthorizedException('Invalid token payload (missing sub)');
    }

    let user: User | null = null;
    try {
      const supabaseUserPayload = payload;
      this.logger.debug(`VALIDATE - Calling syncSupabaseUser`);
      user = await this.authService.syncSupabaseUser(supabaseUserPayload);
      this.logger.debug(`VALIDATE - syncSupabaseUser returned successfully`);
    } catch (error: unknown) {

      if (error instanceof NotFoundException) {
        this.logger.warn(`VALIDATE - User ${payload.sub} not found locally.`);
        throw new UnauthorizedException(`User profile not found.`);
      }
      if (error instanceof UnauthorizedException) {
        this.logger.warn(
          `VALIDATE - User ${payload.sub} is inactive or unauthorized by syncSupabaseUser.`,
        );
        throw error;
      }
      throw new UnauthorizedException(
        'Failed to process user profile during validation.',
      );
    }

    // This part should only be reached if syncSupabaseUser succeeded
    if (!user) {
      this.logger.error(
        `VALIDATE - syncSupabaseUser returned null/undefined unexpectedly for sub: ${payload.sub}`,
      );
      throw new InternalServerErrorException(
        'User synchronization failed unexpectedly.',
      );
    }

    this.logger.log(`VALIDATE - User ${user.email} validated successfully.`);

    const appUser: AppUser = {
      ...user,
      supabaseUser: payload,
    };
    return appUser;
  }
}
