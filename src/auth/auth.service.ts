import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { User, ConfirmationStatus } from '@prisma/client';
import { SupabaseUser } from 'nestjs-supabase-auth';
import { SUPABASE_CLIENT } from './auth.constants';
import {
  SupabaseClient,
  AuthError,
  User as UserSupabase,
} from '@supabase/supabase-js';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
import { RegisterDto } from './dto/register.dto';
import { randomUUID } from 'node:crypto';

const ACCESS_TOKEN_COOKIE = 'access-token';
const REFRESH_TOKEN_COOKIE = 'refresh-token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private setAuthCookies(
    res: Response,
    access_token: string,
    refresh_token: string,
  ) {
    const secure = this.configService.get<string>('NODE_ENV') !== 'development';
    const accessTokenMaxAge = this.configService.get<number>('ACCESS_TOKEN_EXPIRATION_MINUTES', 15) * 1000 * 60; // So if 15 minutes -> 15*60*1000 = 900.000 seconds
    const refreshTokenMaxAge = this.configService.get<number>('REFRESH_TOKEN_EXPIRATION_DAYS', 7) * 1000 * 60 * 60 * 24; // So if 7 days -> 1000*(60^2)*24*7 = 604.800.000 seconds

    res.cookie(ACCESS_TOKEN_COOKIE, access_token, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      maxAge: accessTokenMaxAge,
      path: '/',
    });

    res.cookie(REFRESH_TOKEN_COOKIE, refresh_token, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      maxAge: refreshTokenMaxAge,
      path: '/auth/refresh',
    });
  }

  private clearAuthCookies(res: Response) {
    const secure = this.configService.get<string>('NODE_ENV') !== 'development';
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      path: '/',
    });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      path: '/auth/refresh',
    });
  }

  private handleSupabaseError(error: AuthError, context: string): never {
    this.logger.error(
      `Supabase Error Object in ${context}: ${JSON.stringify(error, null, 2)}`,
    );

    if (error.response) {
      this.logger.error(`Error Response Status: ${error.response.status}`);
      try {
        this.logger.error(
          `Error Response Data: ${JSON.stringify(error.response.data)}`,
        );
      } catch (e) {
        this.logger.error(
          `Error Response Data (non-JSON or logging failed): ${error.response.data}`,
        );
      }
    } else if (error.originalError) {
      this.logger.error(
        `Original Error: ${JSON.stringify(error.originalError, null, 2)}`,
      );
    }

    if (
      error.status === 400 ||
      (error.message && error.message.includes('Invalid login credentials'))
    ) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (error.message && error.message.includes('JSON at position')) {
      throw new InternalServerErrorException(
        `Authentication service failed: Invalid response received from Supabase (${context}). Check Supabase Auth logs for details.`,
      );
    }

    throw new InternalServerErrorException(
      `Authentication service failed: ${context}`,
    );
  }

  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    this.logger.log(`Attempting to set password for user ID: ${userId}`);
    const CONFIRMED_STATUS_NAME = 'CONFIRMADO';

    const confirmedStatus: ConfirmationStatus = this.prisma.confirmationStatus.findUnique({
      where: { status: CONFIRMED_STATUS_NAME },
    })
    const confirmedStatusId: number = confirmedStatus.id;

    try {
      const { data, error: adminUpdateError } =
        await this.supabase.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (adminUpdateError) {
        this.logger.error(
          `Supabase admin updateUserById error for user ${userId}: ${adminUpdateError.message}`,
          adminUpdateError,
        );
        throw new InternalServerErrorException(
          `There was an error updating the password: ${adminUpdateError.message}`,
        );
      }

      if (!data?.user) {
        this.logger.warn(
          `Supabase admin updateUserById for user ${userId} completed but returned no user data.`,
        );
      }

      this.logger.log(
        `Password successfully set/updated for user ID: ${userId}`,
      );

      try {
        this.logger.log(
          `Attempting to update local user status for ID: ${userId} to CONFIRMADO (ID: ${confirmedStatusId})`,
        );
        const updatedLocalUser = await this.prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            confirmationStatusId: confirmedStatusId,
            isActive: true
          },
        });
        this.logger.log(
          `Local user status updated successfully for ID: ${userId}. New status ID: ${updatedLocalUser.confirmationStatusId}`,
        );
      } catch (prismaError) {
        this.logger.error(
          `Failed to update local user status for ID ${userId} after password set: ${prismaError.message}`,
          prismaError.stack,
        );
      }

    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error setting password for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `An unexpected error happened updating the password for user ${userId}`,
      );
    }
  }

  async registerUser(
    registerDto: RegisterDto,
  ): Promise<{ user: UserSupabase }> {
    this.logger.log(`Attempting to register user: ${registerDto.email}`);

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: registerDto.email,
        password: randomUUID(), // We generate a secure, random password for users once they signup
        options: {
          emailRedirectTo: this.configService.get<string>('SIGNUP_REDIRECTION_URL', 'http://localhost:5173/verificar-cuenta'),
        },
      });

      if (error) {
        this.handleSupabaseError(error, 'signUp');
      }
      if (!data?.user) {
        this.logger.error('Supabase signUp returned no user data.');
        throw new InternalServerErrorException(
          'Registration failed: Incomplete data from auth provider.',
        );
      }

      this.logger.log(
        `Supabase registration successful for: ${registerDto.email}`,
      );
      return { user: data.user };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error during Supabase registration: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'An unexpected error occurred during registration.',
      );
    }
  }

  async login(loginDto: LoginDto, res: Response): Promise<{ message: string }> {
    this.logger.log(`Attempting login for user: ${loginDto.email}`);
    let supabaseSessionData;
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: loginDto.email,
        password: loginDto.password,
      });

      if (error) {
        this.handleSupabaseError(error, 'signInWithPassword');
      }
      if (!data?.session || !data?.user) {
        this.logger.error(
          'Supabase signInWithPassword returned no session or user data.',
        );
        throw new InternalServerErrorException(
          'Login failed: Incomplete data from auth provider.',
        );
      }

      supabaseSessionData = data;
      this.logger.log(`Supabase login successful for: ${loginDto.email}`);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error during Supabase login: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'An unexpected error occurred during login.',
      );
    }

    const supabaseUserForSync = {
      sub: supabaseSessionData.user.id,
      email: supabaseSessionData.user.email,
    } as SupabaseUser;

    let localUser: User;
    try {
      localUser = await this.syncSupabaseUser(supabaseUserForSync);
      this.logger.log(`Local user sync successful for: ${localUser.email}`);
    } catch (error) {
      this.logger.error(
        `Local user sync failed after successful Supabase login for ${loginDto.email}: ${error.message}`,
        error.stack,
      );
      // If sync fails (e.g., user not found locally, DB error, or became inactive), we don't proceed.
      await this.supabase.auth.signOut(); // Sign out the potentially just signed-in Supabase session
      if (
        error instanceof InternalServerErrorException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Login failed due to user profile inconsistency.',
      );
    }

    const { access_token, refresh_token } = supabaseSessionData.session;
    if (!access_token || !refresh_token) {
      this.logger.error(
        'Supabase session data missing access or refresh token.',
      );
      await this.supabase.auth.signOut();
      throw new InternalServerErrorException(
        'Login failed: Incomplete token data from auth provider.',
      );
    }

    this.setAuthCookies(res, access_token, refresh_token);
    this.logger.log(`Auth cookies set for user: ${localUser.email}`);

    return { message: 'Login successful' };
  }

  /**
   * Refreshes the session using the refresh token from cookies.
   */
  async refresh(req: Request, res: Response): Promise<{ message: string }> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      this.logger.warn('Refresh attempt without refresh token cookie.');
      throw new UnauthorizedException('Missing refresh token.');
    }

    this.logger.log('Attempting to refresh session using refresh token.');
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        this.logger.warn(`Supabase refreshSession failed: ${error.message}`);
        // If refresh fails (e.g., token expired/invalid), we clear cookies and require login
        this.clearAuthCookies(res);
        throw new UnauthorizedException('Invalid or expired refresh token.');
      }

      if (!data?.session) {
        this.logger.error('Supabase refreshSession returned no session data.');
        this.clearAuthCookies(res);
        throw new InternalServerErrorException(
          'Session refresh failed: Incomplete data from auth provider.',
        );
      }

      const { access_token, refresh_token: new_refresh_token } = data.session;

      if (!access_token || !new_refresh_token) {
        this.logger.error(
          'Refreshed session data missing access or refresh token.',
        );
        this.clearAuthCookies(res);
        throw new InternalServerErrorException(
          'Session refresh failed: Incomplete token data from auth provider.',
        );
      }

      // We set the new tokens in cookies
      this.setAuthCookies(res, access_token, new_refresh_token);
      this.logger.log('Session refreshed successfully.');

      return { message: 'Session refreshed' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error during session refresh: ${error.message}`,
        error.stack,
      );
      this.clearAuthCookies(res); // When unexpected errors occurs we clear the cookies
      throw new InternalServerErrorException(
        'An unexpected error occurred during session refresh.',
      );
    }
  }

  /**
   * Logs the user out by clearing auth cookies.
   */
  async logout(res: Response): Promise<{ message: string }> {
    this.logger.log('Attempting to logout user.');
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) {
        this.logger.warn(
          `Supabase signOut failed during logout: ${error.message}`,
        );
      }
    } catch (e) {
      this.logger.warn(`Error calling Supabase signOut: ${e.message}`);
    }

    this.clearAuthCookies(res);
    this.logger.log('Auth cookies cleared.');
    return { message: 'Logout successful' };
  }

  /**
   * Finds an existing user by Supabase ID. If the user was previously invited
   * (inactive/pending), it activates them upon this first successful login post-confirmation.
   * @param supabaseUser The user object derived from validated Supabase data (needs at least sub, email)
   * @returns The corresponding user from the local database (potentially activated)
   * @throws {InternalServerErrorException} If required statuses are missing in DB or if local user record is unexpectedly missing.
   * @throws {UnauthorizedException} If the found user is marked as inactive AFTER potential activation.
   */
  async syncSupabaseUser(supabaseUser: SupabaseUser): Promise<User> {
    const supabaseId = supabaseUser?.sub;
    const userEmail = supabaseUser?.email;

    if (!supabaseId || !userEmail) {
      this.logger.error(
        'syncSupabaseUser called with incomplete Supabase user data.',
        { sub: supabaseId, email: userEmail },
      );
      throw new BadRequestException(
        'Invalid user data received for synchronization.',
      );
    }

    this.logger.log(
      `Syncing local user for: ${userEmail} (Supabase ID: ${supabaseId})`,
    );

    try {
      let confirmedStatus: ConfirmationStatus | null;
      let pendingStatus: ConfirmationStatus | null;

      const CONFIRMED_STATUS_NAME = 'CONFIRMADO';
      const PENDING_STATUS_NAME = 'PENDIENTE';

      try {
        [confirmedStatus, pendingStatus] = await Promise.all([
          this.prisma.confirmationStatus.findUnique({
            where: { status: CONFIRMED_STATUS_NAME },
          }),
          this.prisma.confirmationStatus.findUnique({
            where: { status: PENDING_STATUS_NAME },
          }),
        ]);
      } catch (dbError) {
        this.logger.error(
          `Database error fetching confirmation statuses: ${dbError.message}`,
          dbError.stack,
        );
        throw new InternalServerErrorException(
          'Database error during status lookup.',
        );
      }

      if (!confirmedStatus) {
        this.logger.error(
          `Configuration Error: Status '${CONFIRMED_STATUS_NAME}' not found in 'estados_confirmacion' table.`,
        );
        throw new InternalServerErrorException(
          'Server configuration error: Missing required user status.',
        );
      }
      if (!pendingStatus) {
        this.logger.error(
          `Configuration Error: Status '${PENDING_STATUS_NAME}' not found in 'estados_confirmacion' table.`,
        );
        throw new InternalServerErrorException(
          'Server configuration error: Missing required user status.',
        );
      }

      let user = await this.prisma.user.findUnique({
        where: { id: supabaseId },
      });

      // Here we handle the case when the user is not found in our internal `Usuarios` table
      if (!user) {
        // This is critical because Supabase authenticated the user, but they don't exist locally.
        // This indicates a failure in the preceding registration or invitation process.
        this.logger.error(
          `CRITICAL: No local user record found for validated Supabase user ${userEmail} (ID: ${supabaseId}). Check registration/invite process flow.`,
        );
        throw new NotFoundException(`User profile for ${userEmail} not found.`);
      }

      // If for some reason the user needs activation
      if (
        !user.isActive && // User is currently inactive
        user.confirmationStatusId === pendingStatus.id // And has the 'PENDIENTE' status
      ) {
        this.logger.log(
          `Activating previously pending user: ${user.email} (ID: ${user.id})`,
        );
        user = await this.prisma.user.update({
          where: { id: supabaseId },
          data: {
            isActive: true,
            confirmationStatusId: confirmedStatus.id,
          },
        });
        this.logger.log(`User ${user.email} successfully activated.`);
      } else {
        this.logger.log(
          `User ${user.email} found in local DB. Active: ${user.isActive}, Status ID: ${user.confirmationStatusId}. Does not require activation.`,
        );
      }

      if (!user.isActive) {
        this.logger.warn(
          `User ${user.email} (ID: ${user.id}) is inactive in the local database AFTER synchronization/activation check. Access denied.`,
        );
        throw new UnauthorizedException('User account is currently inactive.');
      }

      this.logger.log(
        `Local user sync successful: ${user.email} (Active: ${user.isActive})`,
      );
      return user;
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error(
        `Unexpected error during user synchronization for ${userEmail} (ID: ${supabaseId}): ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'An error occurred while synchronizing user profile.',
      );
    }
  }

  /**
   * Retrieves the profile data for the currently authenticated user.
   */
  async getMyProfile(userId: string): Promise<Partial<User>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { name: true, description: true } },
        confirmationStatus: { select: { status: true } },
      },
    });

    if (!user) {
      this.logger.warn(
        `getMyProfile failed: User profile not found for ID ${userId}.`,
      );
      throw new NotFoundException('User profile not found.');
    }

    const { roleId, confirmationStatusId, ...profileData } = user;
    return profileData;
  }
}
