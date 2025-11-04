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
import { User } from '@prisma/client';
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
  private EMAIL_RESET_PASSWORD_TEMPLATE: string;

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
      const EMAIL_RESET_PASSWORD_TEMPLATE = this.configService.get<string>(
        'EMAIL_RESET_PASSWORD_TEMPLATE',
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
      else if (!EMAIL_RESET_PASSWORD_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_RESET_PASSWORD_TEMPLATE' not found. Application might not function correctly`,
        );

      this.EMAIL_PUBLIC_API_KEY = EMAIL_PUBLIC_API_KEY;
      this.EMAIL_PRIVATE_API_KEY = EMAIL_PRIVATE_API_KEY;
      this.EMAIL_SERVICE_ID = EMAIL_SERVICE_ID;
      this.EMAIL_CONFIRMATION_TEMPLATE = EMAIL_CONFIRMATION_TEMPLATE;
      this.EMAIL_RESET_PASSWORD_TEMPLATE = EMAIL_RESET_PASSWORD_TEMPLATE;

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
      // Hash the password locally
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

  // done locally
  async registerUser(registerDto: RegisterDto): Promise<User> {
    this.logger.log(`Attempting to register user: ${registerDto.email}`);

    let user: User;
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      });
      if (existingUser) {
        this.logger.warn(`Registration attempt for existing email: ${registerDto.email}`);
        throw new ConflictException('A user with that email already exists');
      }

      // Create user in local database
      const userId = randomUUID();
      user = await this.prisma.user.create({
        data: {
          id: userId,
          email: registerDto.email,
          firstName: "",
          lastName: "",
          roleId: 2, // Default role ID (student)
          confirmationStatusId: this.pendingStatusId,
          isActive: false, // User starts inactive until email is confirmed
          createdAt: new Date(),
        },
      });
      this.logger.log(`Local user created successfully for: ${registerDto.email}`);

      // Send verification email (same flow as before)
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
          email: user.email,
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
          `Unexpected error during local registration: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          'An unexpected error occurred during registration.',
        );
      }
    }
    return user!;
  }

  // done locally
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
  // done locally
  async refresh(
    req: Request,
    res: Response,
  ): Promise<{ message: string; accessToken: string }> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      this.logger.warn('Refresh attempt without refresh token cookie.');
      this.logger.warn(`Available cookies: ${JSON.stringify(req.cookies)}`);
      throw new UnauthorizedException('Missing refresh token.');
    }

    this.logger.log('Attempting to refresh session using local JWT.');

    try {
      // Verify the refresh token using our local JWT service
      const payload = this.jwtService.verify(refreshToken);
      
      if (!payload || !payload.sub || !payload.email) {
        this.logger.warn('Invalid refresh token payload');
        this.clearAuthCookies(res);
        throw new UnauthorizedException('Invalid refresh token.');
      }

      // Check if user still exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        this.logger.warn(`Refresh token user ${payload.email} not found or inactive`);
        this.clearAuthCookies(res);
        throw new UnauthorizedException('User account is no longer active.');
      }

      // Generate new tokens
      const newPayload = { sub: user.id, email: user.email };
      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      this.setAuthCookies(res, newAccessToken, newRefreshToken);
      this.logger.log(`Session refreshed successfully for user: ${user.email}`);

      return { message: 'Session refreshed', accessToken: newAccessToken };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      this.logger.error(
        `Error during session refresh: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.clearAuthCookies(res);
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  /**
   * Logs the user out by clearing auth cookies.
   */
  // done locally
  async logout(res: Response): Promise<{ message: string }> {
    this.logger.log('Attempting to logout user.');
    
    this.clearAuthCookies(res);
    this.logger.log('Local logout successful - auth cookies cleared.');
    
    return { message: 'Logout successful' };
  }

  /**
   * Validates and syncs a local JWT user with the database.
   * @param jwtPayload The decoded JWT payload from our local tokens
   * @returns The corresponding user from the local database with role permissions
   * @throws {NotFoundException} If user is not found in local database
   * @throws {UnauthorizedException} If user is inactive
   */
  async syncLocalUser(jwtPayload: JwtPayload): Promise<User> {    
    this.logger.debug(`Syncing local user with ID: ${jwtPayload.sub}`);

    const cacheKey = this.getUserProfileCacheKey(jwtPayload.sub);
    
    // Try cache first
    const cachedUser = await this.cacheService.get(cacheKey);
    if (cachedUser) {
      if (!cachedUser.isActive) {
        this.logger.warn(
          `Cached user ${cachedUser.email} (ID: ${cachedUser.id}) is inactive. Access denied.`,
        );
        await this.cacheService.delete(cacheKey);
        throw new UnauthorizedException('User account is currently inactive.');
      }
      this.logger.debug(`Local user ${jwtPayload.sub} found in cache`);
      return cachedUser;
    }
    
    // Find user in local database with full role/permissions data
    const user = await this.prisma.user.findUnique({
      where: { id: jwtPayload.sub },
      include: {
        role: true,
        confirmationStatus: true,
      },
    });

    if (!user) {
      this.logger.warn(`Local user ${jwtPayload.sub} not found in database`);
      throw new NotFoundException('User not found in local database');
    }

    if (!user.isActive) {
      this.logger.warn(`Local user ${jwtPayload.sub} (${user.email}) is inactive`);
      throw new UnauthorizedException('User account is inactive');
    }

    // Cache the user profile
    await this.cacheService.set(cacheKey, user, this.USER_PROFILE_CACHE_TTL);
    this.logger.debug(`Local user ${user.email} synced and cached successfully`);

    return user;
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

  async invalidateUserProfileCache(userId: string): Promise<void> {
    const cacheKey = this.getUserProfileCacheKey(userId);
    await this.cacheService.delete(cacheKey);
    this.logger.log(
      `User profile cache invalidated for user ID: ${userId}`,
    );
  }

  /**
   * Resends the confirmation email to the user.
   * @param email The email address of the user to resend the confirmation email to.
   * @throws {NotFoundException} If the user is not found in the local database.
   * @throws {ConflictException} If the user is already confirmed.
   * @throws {InternalServerErrorException} If there is an error sending the email.
   */
  // done locally
  async resendEmailOfType(email: string, typeOfEmail: string): Promise<{ message: string }> {
    this.logger.log(`Attempting to resend confirmation email to: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { confirmationStatus: true },
    });

    if (!user) {
      this.logger.error(`User with email ${email} not found in local DB.`);
      throw new NotFoundException('The email address is not registered.');
    }

    if (typeOfEmail === "CONFIRMATION" && user.confirmationStatus?.status === 'CONFIRMADO') {
      this.logger.warn(`User with email ${email} is already confirmed.`);
      throw new ConflictException('The email has already been confirmed.');
    }

    try {
      // Delete any existing verification token for this user
      await this.prisma.verificationToken.deleteMany({
        where: {
          userId: user.id,
          tokenTypeId: this.verificationTokenId,
        },
      });

      // Generate new verification token
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
      ); // 24 hours

      // Create new verification token
      await this.prisma.verificationToken.create({
        data: {
          token: verificationToken,
          email: user.email,
          userId: user.id,
          tokenTypeId: this.verificationTokenId,
          expiresAt: expiresAt,
        },
      });

      // Get user's display name (firstName or lastName/email as fallback)
      const userName = user.firstName
        ? user.firstName.trim()
        : user.lastName || user.email.split('@')[0];

      // Determine the email template based on typeOfEmail
      // Possible to add more types in the future
      let template: string;
      let templateParams: Record<string, unknown>;

      if (typeOfEmail === 'CONFIRMATION') {
        template = this.EMAIL_CONFIRMATION_TEMPLATE;
        templateParams = {
          email: email,
          confirmationURL: `${REDIRECT_TO}/verificar-cuenta?token=${verificationToken}`,
        };
      } else if (typeOfEmail === 'RESET_PASSWORD') {
        template = this.EMAIL_RESET_PASSWORD_TEMPLATE;
        templateParams = {
          email: email,
          user_name: userName,
          resetPasswordURL: `${REDIRECT_TO}/establecer-contrasena?token=${verificationToken}`,
        };
      } else {
        this.logger.error(`Invalid email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid email type specified.');
      }

      // Send new verification email
      this.sendEmailTemplate(template, templateParams);

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Correo reenviado con éxito' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        this.logger.error(
          `Error resending ${typeOfEmail} email to ${email}: ${error.message}`,
          error.stack,
        );
      }

      throw new InternalServerErrorException(
        'Error al reenviar el correo.',
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

  private getUserProfileCacheKey(userId: string): string {
    return `${this.USER_PROFILE_CACHE_PREFIX}${userId}`;
  }
}
