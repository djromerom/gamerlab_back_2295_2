import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  Inject,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { User, ConfirmationStatus } from '@prisma/client';
import { SUPABASE_CLIENT } from './auth.constants';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  SupabaseClient,
  AuthError,
  User as UserSupabase,
} from '@supabase/supabase-js';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { Request, Response } from 'express';
import emailjs, { EmailJSResponseStatus } from '@emailjs/nodejs';
import { RegisterDto } from './dto/register.dto';
import { randomUUID } from 'node:crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CacheService } from 'src/cache/cache.service';
import { TokenVerification } from './types/token-verification.type';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

const ACCESS_TOKEN_COOKIE = 'access-token';
const REFRESH_TOKEN_COOKIE = 'refresh-token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Mailer configuration
  private EMAIL_PUBLIC_API_KEY: string;
  private EMAIL_PRIVATE_API_KEY: string;
  private EMAIL_SERVICE_ID: string;
  private EMAIL_CONFIRMATION_TEMPLATE: string;

  private confirmedStatusId: number;
  private pendingStatusId: number;
  private verificationTokenId: number;

  private readonly CONFIRMED_STATUS_NAME = 'CONFIRMADO';
  private readonly PENDING_STATUS_NAME = 'PENDIENTE';
  private readonly VERIFICATION_TOKEN_NAME = 'VERIFICACION_EMAIL';

  // Cache
  private readonly USER_PROFILE_CACHE_PREFIX = 'user_profile:';
  private USER_PROFILE_CACHE_TTL: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly jwtService: JwtService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'Initializing AuthService: Fetching confirmation statuses...',
    );
    try {
      const [confirmedStatus, pendingStatus] = await Promise.all([
        this.prisma.confirmationStatus.findUnique({
          where: { status: this.CONFIRMED_STATUS_NAME },
        }),
        this.prisma.confirmationStatus.findUnique({
          where: { status: this.PENDING_STATUS_NAME },
        }),
      ]);

      if (!confirmedStatus) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Status '${this.CONFIRMED_STATUS_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required status '${this.CONFIRMED_STATUS_NAME}'.`,
        );
      }
      if (!pendingStatus) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Status '${this.PENDING_STATUS_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required status '${this.PENDING_STATUS_NAME}'.`,
        );
      }

      this.confirmedStatusId = confirmedStatus.id;
      this.pendingStatusId = pendingStatus.id;
      this.logger.log(
        `Confirmation statuses initialized: CONFIRMADO ID=${this.confirmedStatusId}, PENDIENTE ID=${this.pendingStatusId}`,
      );

      const verificationToken = await this.prisma.tokenType.findUnique({
        where: { type: this.VERIFICATION_TOKEN_NAME },
      });

      if (!verificationToken) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Token type '${this.VERIFICATION_TOKEN_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required Token type '${this.VERIFICATION_TOKEN_NAME}'.`,
        );
      }

      this.verificationTokenId = verificationToken.id;

      this.logger.log('Setting USER_PROFILE_CACHE_TTL');
      this.USER_PROFILE_CACHE_TTL =
        this.configService.get<number>('USER_PROFILE_CACHE_TTL', 15) *
        60 *
        1000; // By default, 15 minutes
      this.logger.log(
        `USER_PROFILE_CACHE_TTL set to ${this.USER_PROFILE_CACHE_TTL} seconds`,
      );

      this.logger.log('Setting up EmailJS client');
      const EMAIL_PUBLIC_API_KEY = this.configService.get<string>(
        'EMAIL_PUBLIC_API_KEY',
      );
      const EMAIL_PRIVATE_API_KEY = this.configService.get<string>(
        'EMAIL_PRIVATE_API_KEY',
      );
      const EMAIL_SERVICE_ID =
        this.configService.get<string>('EMAIL_SERVICE_ID');
      const EMAIL_CONFIRMATION_TEMPLATE = this.configService.get<string>(
        'EMAIL_CONFIRMATION_TEMPLATE',
      );

      if (!EMAIL_PUBLIC_API_KEY || !EMAIL_PRIVATE_API_KEY)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_PUBLIC_API_KEY' or 'EMAIL_PRIVATE_API_KEY' variables not found. Application might not function correctly`,
        );
      else if (!EMAIL_SERVICE_ID)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_SERVICE_ID' not found. Application might not function correctly`,
        );
      else if (!EMAIL_CONFIRMATION_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_CONFIRMATION_TEMPLATE' not found. Application might not function correctly`,
        );

      this.EMAIL_PUBLIC_API_KEY = EMAIL_PUBLIC_API_KEY;
      this.EMAIL_PRIVATE_API_KEY = EMAIL_PRIVATE_API_KEY;
      this.EMAIL_SERVICE_ID = EMAIL_SERVICE_ID;
      this.EMAIL_CONFIRMATION_TEMPLATE = EMAIL_CONFIRMATION_TEMPLATE;

      this.logger.log('Initializing EmailJS with found EMAIL_API_KEY');
      emailjs.init({
        publicKey: this.EMAIL_PUBLIC_API_KEY,
        privateKey: this.EMAIL_PRIVATE_API_KEY,
      });
      this.logger.log('EmailJS successfully initialized');
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Failed to initialize confirmation statuses: ${error.message}`,
          error.stack,
        );
      throw error;
    }
  }

  async resetTokenExpiration(userId: string): Promise<void> {
    try {
      // Buscar el token de verificación para el usuario
      const token = await this.prisma.verificationToken.findFirst({
        where: {
          userId: userId,
          tokenTypeId: this.verificationTokenId,
        },
      });
      if (!token) {
        this.logger.warn(`No verification token found for this user`);
        throw new NotFoundException(
          'No verification token found for this user',
        );
      }
      // Calcular nueva fecha de expiración (ahora + 1 día) en la zona horaria local
      const now = new Date();
      const newExpirationDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      // Formatear la fecha manualmente para evitar problemas con UTC
      const year = newExpirationDate.getFullYear();
      const month = String(newExpirationDate.getMonth() + 1).padStart(2, '0');
      const day = String(newExpirationDate.getDate()).padStart(2, '0');
      const hours = String(newExpirationDate.getHours()).padStart(2, '0');
      const minutes = String(newExpirationDate.getMinutes()).padStart(2, '0');
      const seconds = String(newExpirationDate.getSeconds()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.000`;
      // Actualizar la fecha de expiración
      await this.prisma.verificationToken.update({
        where: { id: token.id },
        data: {
          expiresAt: new Date(formattedDate),
        },
      });
      this.logger.log(
        `Token expiration reset successfully for user ID: ${userId}. New expiration: ${formattedDate}`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Error) {
        this.logger.error(
          `Error resetting token expiration for user ${userId}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Unknown error resetting token expiration for user ${userId}`,
        );
      }
      throw new InternalServerErrorException(
        'Error resetting token expiration',
      );
    }
  }

  // done locally
  async setUserPassword(token: string, newPassword: string): Promise<void> {
    this.logger.log(
      `Attempting to set password using token: ${token ? token.substring(0, 8) + '...' : 'UNDEFINED'}`,
    );

    const storedToken = await this.prisma.verificationToken.findUnique({
      where: { token: token },
      include: { type: true },
    });

    if (!storedToken) {
      this.logger.warn(
        `Set password attempt with invalid token: ${token.substring(0, 8)}...`,
      );
      throw new BadRequestException('Invalid or expired link.');
    }

    if (new Date() > storedToken.expiresAt) {
      this.logger.warn(
        `Set password attempt with expired token: ${token.substring(0, 8)}... for user ${storedToken.userId}`,
      );
      await this.prisma.verificationToken.delete({
        where: { id: storedToken.id },
      });
      throw new BadRequestException(
        'This link has expired. Please request a new one.',
      );
    }

    const userId = storedToken.userId;
    this.logger.log(
      `Token validated for user ID: ${userId} (Type: ${storedToken.type.type}). Proceeding to set password.`,
    );

    try {
      // Hash the password locally instead of using Supabase
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      
      // Update the user's password in our local database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { 
          password: hashedPassword,
          confirmationStatusId: this.confirmedStatusId,
          isActive: true,
        },
      });

      if (!updatedUser) {
        this.logger.warn(
          `Local user update for user ${userId} failed - user not found.`,
        );
        throw new NotFoundException('User not found.');
      }

      this.logger.log(
        `Password successfully set/updated for user ID: ${userId}`,
      );

      try {
        this.logger.log(
          `Attempting to update local user status for ID: ${userId} to CONFIRMADO (ID: ${this.confirmedStatusId})`,
        );
        const updatedLocalUser = await this.prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            confirmationStatusId: this.confirmedStatusId,
            isActive: true,
          },
        });
        this.logger.log(
          `Local user status updated successfully for ID: ${userId}. New status ID: ${updatedLocalUser.confirmationStatusId}`,
        );
      } catch (prismaError) {
        if (prismaError instanceof PrismaClientKnownRequestError)
          this.logger.error(
            `Failed to update local user status for ID ${userId} after password set: ${prismaError.message}`,
            prismaError.stack,
          );
      }

      await this.prisma.verificationToken.delete({
        where: { id: storedToken.id },
      });

      this.logger.log(
        `Token invalidated for user ID: ${userId} after successful password set.`,
      );
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(
          `Unexpected error setting password for user ${userId}: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          `An unexpected error happened updating the password for user ${userId}`,
        );
      }
    }
  }

  async verifyTokenValidity(
    tokenString: string,
    expectedTokenType?: string,
  ): Promise<TokenVerification> {
    const storedToken = await this.prisma.verificationToken.findUnique({
      where: { token: tokenString },
      include: { type: true },
    });

    if (!storedToken) {
      this.logger.warn(`Token not found: ${tokenString.substring(0, 8)}...`);
      return { isValid: false, message: 'Invalid or expired link.' };
    }

    if (new Date() > storedToken.expiresAt) {
      this.logger.warn(
        `Token expired: ${tokenString.substring(0, 8)}... for user ${storedToken.userId}`,
      );
      return {
        isValid: false,
        message: 'This link has expired. Please request a new one.',
      };
    }

    if (expectedTokenType && storedToken.type.type !== expectedTokenType) {
      this.logger.warn(
        `Token type mismatch for ${tokenString.substring(0, 8)}... Expected ${expectedTokenType}, got ${storedToken.type.type}`,
      );
      return {
        isValid: false,
        message: 'This link cannot be used for this purpose.',
      };
    }

    this.logger.log(
      `Token ${tokenString.substring(0, 8)}... is valid for user ${storedToken.userId}`,
    );
    return {
      isValid: true,
      message: 'Token is valid.',
      email: storedToken.email,
      userId: storedToken.userId,
      type: storedToken.type.type,
    };
  }

  async registerUser(registerDto: RegisterDto): Promise<UserSupabase> {
    this.logger.log(`Attempting to register user: ${registerDto.email}`);

    let user: UserSupabase;
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: registerDto.email,
        password: randomUUID(),
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

      user = data.user;

      this.logger.log(`Sending verification email for '${registerDto.email}'`);

      const REDIRECT_TO = this.configService.get<string>(
        'FRONTEND_URL',
        `http://localhost:5173`,
      );

      const TOKEN_EXPIRATION_TIME = this.configService.get<number>(
        'REGISTRATION_TOKEN_EXPIRATION',
        24,
      );

      const verificationToken = randomUUID();
      const expiresAt = new Date(
        Date.now() + TOKEN_EXPIRATION_TIME * 60 * 60 * 1000,
      ); //24 hours

      await this.prisma.verificationToken.create({
        data: {
          token: verificationToken,
          email: user.email!,
          userId: user.id,
          tokenTypeId: this.verificationTokenId,
          expiresAt: expiresAt,
        },
      });

      this.sendEmailTemplate(this.EMAIL_CONFIRMATION_TEMPLATE, {
        email: registerDto.email,
        confirmationURL: `${REDIRECT_TO}/verificar-cuenta?token=${verificationToken}`,
      });
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(
          `Unexpected error during Supabase registration: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          'An unexpected error occurred during registration.',
        );
      }
    }

    return user!;
  }

  async login(loginDto: LoginDto, res: Response): Promise<{ message: string }> {
    this.logger.log(`Attempting login for user: ${loginDto.email}`);
    
    // Find user in local database
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        confirmationStatus: true,
        role: true,
      },
    });

    if (!user) {
      this.logger.warn(`Login attempt failed: User not found for email: ${loginDto.email}`);
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.password) {
      this.logger.warn(`Login attempt failed: User ${loginDto.email} has no password set`);
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Verify password using bcrypt
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Login attempt failed: Invalid password for user: ${loginDto.email}`);
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Check if user is active
    if (!user.isActive) {
      this.logger.warn(`Login attempt failed: User ${loginDto.email} is inactive`);
      throw new UnauthorizedException('User account is currently inactive.');
    }

    // Generate JWT tokens
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.setAuthCookies(res, accessToken, refreshToken);
    this.logger.log(`Local authentication successful for user: ${loginDto.email}`);

    this.updateLastSignIn(loginDto.email);

    return { message: 'Login successful' };
  }

  async updateLastSignIn(emailUser: string) {
    const data = await this.prisma.user.findUnique({
      where: { email: emailUser },
    });

    if (!data) {
      throw new Error('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: data.id },
      data: { lastSignInAt: new Date() },
    });

    return updatedUser; // O lo que quieras retornar
  }

  /**
   * Refreshes the session using the refresh token from cookies.
   */
  async refresh(
    req: Request,
    res: Response,
  ): Promise<{ message: string; accessToken: string }> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      this.logger.warn('Refresh attempt without refresh token cookie.');
      throw new UnauthorizedException('Missing refresh token.');
    }

    this.logger.log('Attempting to refresh session using refresh token.');
    let tokenFromSupabase: string | undefined;

    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        this.logger.warn(`Supabase refreshSession failed: ${error.message}`);
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

      tokenFromSupabase = access_token;

      this.setAuthCookies(res, tokenFromSupabase, new_refresh_token);
      this.logger.log('Session refreshed successfully.');
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(
          `Unexpected error during session refresh: ${error.message}`,
          error.stack,
        );
        this.clearAuthCookies(res);
        throw new InternalServerErrorException(
          'An unexpected error occurred during session refresh.',
        );
      }
      this.clearAuthCookies(res);
      throw new InternalServerErrorException(
        'An unknown error occurred during session refresh.',
      );
    }

    if (tokenFromSupabase === undefined) {
      this.logger.error(
        'CRITICAL: tokenFromSupabase is undefined before returning from refresh. This indicates a logic flaw.',
      );
      throw new InternalServerErrorException(
        'Failed to define token for frontend response despite no error thrown.',
      );
    }

    return { message: 'Session refreshed', accessToken: tokenFromSupabase };
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
      if (e instanceof Error)
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
  async syncSupabaseUser(supabaseUser: JwtPayload): Promise<User> {
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

    const cacheKey = this.getUserProfileCacheKey(supabaseId);

    const cachedUser: User = await this.cacheService.get(cacheKey);
    if (cachedUser) {
      if (!cachedUser.isActive) {
        this.logger.warn(
          `Cached user ${cachedUser.email} (ID: ${cachedUser.id}) is inactive. Access denied. Re-validating with DB.`,
        );
        await this.cacheService.delete(cacheKey);
        throw new UnauthorizedException(
          'User account is currently inactive (checked from cache).',
        );
      }
      this.logger.log(
        `Cache hit for user: ${userEmail} (Supabase ID: ${supabaseId})`,
      );
      return cachedUser;
    }

    this.logger.log(
      `Cache miss. Syncing local user from DB: ${userEmail} (Supabase ID: ${supabaseId})`,
    );

    let user: User | null;
    try {
      user = await this.prisma.user.findUnique({
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
        user.confirmationStatusId === this.pendingStatusId // And has the 'PENDIENTE' status
      ) {
        this.logger.log(
          `Activating previously pending user: ${user.email} (ID: ${user.id})`,
        );
        user = await this.prisma.user.update({
          where: { id: supabaseId },
          data: {
            isActive: true,
            confirmationStatusId: this.confirmedStatusId,
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

      await this.cacheService.set(cacheKey, user, this.USER_PROFILE_CACHE_TTL);
      this.logger.log(`User ${user.email} synced and cached successfully.`);
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(
          `Unexpected error during user synchronization for ${userEmail} (ID: ${supabaseId}): ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          'An error occurred while synchronizing user profile.',
        );
      }
    }

    return user!;
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

  async invalidateUserProfileCache(supabaseId: string): Promise<void> {
    const cacheKey = this.getUserProfileCacheKey(supabaseId);
    await this.cacheService.delete(cacheKey);
    this.logger.log(
      `User profile cache invalidated for Supabase ID: ${supabaseId}`,
    );
  }

  /**
   * Resends the confirmation email to the user.
   * @param email The email address of the user to resend the confirmation email to.
   * @throws {NotFoundException} If the user is not found in the local database.
   * @throws {ConflictException} If the user is already confirmed.
   * @throws {InternalServerErrorException} If there is an error sending the email.
   */
  async resendConfirmationEmail(email: string) {
    this.logger.log(`Attempting to resend confirmation email to: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { confirmationStatus: true },
    });

    if (!user) {
      this.logger.error(`User with email ${email} not found in local DB.`);
      throw new NotFoundException('The email address is not registered.');
    }

    if (user.confirmationStatus?.status === 'CONFIRMADO') {
      this.logger.warn(`User with email ${email} is already confirmed.`);
      throw new ConflictException('The email has already been confirmed.');
    }

    try {
      const result = await this.supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: 'http://localhost:5173/verificar-cuenta',
        },
      });
      const { error } = result;
      if (error) {
        this.logger.log(error);
        if (error.message.includes('User not found')) {
          throw new NotFoundException(
            'El correo electrónico no está registrado.',
          );
        }
        if (error.message.includes('User already confirmed')) {
          throw new BadRequestException(
            'El correo electrónico ya está confirmado.',
          );
        }
        throw new InternalServerErrorException(
          'Error al reenviar el correo de confirmación.',
        );
      }
      this.logger.log(`Confirmation email resent successfully to: ${email}`);
      return { message: 'Correo reenviado con éxito' };
    } catch (err) {
      this.logger.error(`Unhandled error: ${err}`);
      throw new InternalServerErrorException(
        'Error al reenviar el correo de confirmación.',
      );
    }
  }

  /**
   * Sends an email template to a given email.
   * @param template The name of the template email that will be sent. Check `src/templates/email`
   * @param email The email the template will be sent to.
   * @param templateParams If the template has params, you can send them in this object
   * @throws {InternalServerErrorException} If there is an error sending the email.
   */
  private async sendEmailTemplate(
    template: string,
    templateParams: Record<string, unknown>,
  ) {
    try {
      this.logger.log(
        `Attempting to send verification email to ${templateParams.email} via EmailJS.`,
      );

      await emailjs.send(this.EMAIL_SERVICE_ID, template, templateParams);

      this.logger.log(`Verification email sent successfully via EmailJS`);
    } catch (error) {
      if (error instanceof EmailJSResponseStatus) {
        this.logger.log(`EmailJS service failed: ${JSON.stringify(error)}`);
        throw new InternalServerErrorException(
          'An error ocurred while preparing the verification email',
        );
      }

      this.logger.log(error);
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        'An error occurred while preparing the verification email.',
      );
    }
  }

  private setAuthCookies(
    res: Response,
    access_token: string,
    refresh_token: string,
  ) {
    const secure = this.configService.get<string>('NODE_ENV') !== 'development';
    const accessTokenMaxAge =
      this.configService.get<number>('ACCESS_TOKEN_EXPIRATION_MINUTES', 15) *
      1000 *
      60; // So if 15 minutes -> 15*60*1000 = 900.000 seconds
    const refreshTokenMaxAge =
      this.configService.get<number>('REFRESH_TOKEN_EXPIRATION_DAYS', 7) *
      1000 *
      60 *
      60 *
      24; // So if 7 days -> 1000*(60^2)*24*7 = 604.800.000 seconds

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

    if (error.code === 'user_already_exists')
      throw new ConflictException('A user with that email already exists');

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

  private getUserProfileCacheKey(supabaseId: string): string {
    return `${this.USER_PROFILE_CACHE_PREFIX}${supabaseId}`;
  }
}
