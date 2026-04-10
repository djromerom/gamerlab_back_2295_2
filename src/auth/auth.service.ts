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
import { Prisma, User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { Request, Response } from 'express';
import { RegisterDto } from './dto/register.dto';
import { randomUUID } from 'node:crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CacheService } from 'src/cache/cache.service';
import { TokenVerification } from './types/token-verification.type';
import { AuthEmailType } from '../email/types/email-type.type';
import { LoginType } from './types/login-type.type';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EmailService } from '../email/email.service';

const ACCESS_TOKEN_COOKIE = 'access-token';
const REFRESH_TOKEN_COOKIE = 'refresh-token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private confirmedStatusId: number;
  private pendingStatusId: number;
  private verificationTokenId: number;
  private resetPasswordTokenId: number;

  private tenantId: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  private readonly CONFIRMED_STATUS_NAME = 'CONFIRMADO';
  private readonly PENDING_STATUS_NAME = 'PENDIENTE';
  private readonly VERIFICATION_TOKEN_NAME = 'VERIFICACION_EMAIL';
  private readonly RESET_PASSWORD_TOKEN_NAME = 'RESETEAR_CONTRASENA';

  // Cache
  private readonly USER_PROFILE_CACHE_PREFIX = 'user_profile:';
  private USER_PROFILE_CACHE_TTL: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
    private readonly emailService: EmailService,
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
      const resetPasswordToken = await this.prisma.tokenType.findUnique({
        where: { type: this.RESET_PASSWORD_TOKEN_NAME },
      });

      if (!verificationToken) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Token type '${this.VERIFICATION_TOKEN_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required Token type '${this.VERIFICATION_TOKEN_NAME}'.`,
        );
      }

      if (!resetPasswordToken) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Token type '${this.RESET_PASSWORD_TOKEN_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required Token type '${this.RESET_PASSWORD_TOKEN_NAME}'.`,
        );
      }

      this.verificationTokenId = verificationToken.id;
      this.resetPasswordTokenId = resetPasswordToken.id;

      this.logger.log('Setting USER_PROFILE_CACHE_TTL');
      this.USER_PROFILE_CACHE_TTL =
        this.configService.get<number>('USER_PROFILE_CACHE_TTL', 15) *
        60 *
        1000; // By default, 15 minutes
      this.logger.log(
        `USER_PROFILE_CACHE_TTL set to ${this.USER_PROFILE_CACHE_TTL} seconds`,
      );

      // Initialize Microsoft Entra ID configuration
      const tenantId = this.configService.get<string>('AZURE_TENANT_ID');
      const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
      const clientSecret = this.configService.get<string>(
        'AZURE_CLIENT_SECRET',
      );
      const redirectUri = this.configService.get<string>('REDIRECT_URI');

      if (!tenantId || !clientId || !clientSecret || !redirectUri) {
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - Microsoft Entra ID variables not found. Application might not function correctly`,
        );
      }

      this.tenantId = tenantId;
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.redirectUri = redirectUri;
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Failed to initialize confirmation statuses: ${error.message}`,
          error.stack,
        );
      throw error;
    }
  }

  /**
   * Resets token expiration for a user's verification or reset password token
   */
  async resetTokenExpiration(
    userId: string,
    typeOfToken: AuthEmailType,
  ): Promise<void> {
    try {
      // Find the appropriate token type
      const tokenTypeId =
        typeOfToken === 'VERIFICACION_EMAIL'
          ? this.verificationTokenId
          : this.resetPasswordTokenId;

      const token = await this.prisma.verificationToken.findFirst({
        where: {
          userId: userId,
          tokenTypeId: tokenTypeId,
        },
      });

      if (!token) {
        this.logger.warn(`No verification token found for this user`);
        throw new NotFoundException(
          'No verification token found for this user.',
        );
      }

      const TOKEN_EXPIRATION_TIME = this.configService.get<number>(
        'REGISTRATION_TOKEN_EXPIRATION',
        24,
      );

      const newExpiresAt = new Date(
        Date.now() + TOKEN_EXPIRATION_TIME * 60 * 60 * 1000,
      );

      await this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { expiresAt: newExpiresAt },
      });

      this.logger.log(`Token expiration reset for user ${userId}`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to reset token expiration: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Failed to reset token expiration.',
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
          authMethod: 'PASSWORD',
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
      throw new BadRequestException('Invalid link.');
    }

    if (new Date() > storedToken.expiresAt) {
      this.logger.warn(
        `Token expired: ${tokenString.substring(0, 8)}... for user ${storedToken.userId}`,
      );
      throw new BadRequestException(
        'This link has expired. Please request a new one.',
      );
    }

    if (expectedTokenType && storedToken.type.type !== expectedTokenType) {
      this.logger.warn(
        `Token type mismatch for ${tokenString.substring(0, 8)}... Expected ${expectedTokenType}, got ${storedToken.type.type}`,
      );
      throw new BadRequestException(
        'This link cannot be used for this purpose.',
      );
    }

    this.logger.log(
      `Token ${tokenString.substring(0, 8)}... is valid for user ${storedToken.userId}`,
    );

    // Only return success object for valid tokens
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

    try {
      return await this.prisma.$transaction(async (tx) => {
        return this.registerUserInternal(registerDto, tx);
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
      throw error;
    }
  }

  // Private method with the actual user registration logic
  private async registerUserInternal(
    registerDto: RegisterDto,
    tx: Prisma.TransactionClient,
  ): Promise<User> {
    try {
      // Check if user already exists within transaction
      const existingUser = await tx.user.findUnique({
        where: { email: registerDto.email },
      });

      if (existingUser) {
        this.logger.warn(
          `Registration attempt for existing email: ${registerDto.email}`,
        );
        throw new ConflictException('A user with that email already exists');
      }

      // Create user within transaction
      const userId = randomUUID();
      const user = await tx.user.create({
        data: {
          id: userId,
          email: registerDto.email,
          firstName: '',
          lastName: '',
          roleId: 2, // Default role ID (student)
          confirmationStatusId: this.pendingStatusId,
          isActive: false, // User starts inactive until email is confirmed
          createdAt: new Date(),
        },
      });

      this.logger.log(
        `Local user created successfully for: ${registerDto.email}`,
      );

      // Create verification token within transaction
      const verificationToken = randomUUID();
      const TOKEN_EXPIRATION_TIME = this.configService.get<number>(
        'REGISTRATION_TOKEN_EXPIRATION',
        24,
      );
      const expiresAt = new Date(
        Date.now() + TOKEN_EXPIRATION_TIME * 60 * 60 * 1000,
      ); // 24 hours

      await tx.verificationToken.create({
        data: {
          id: randomUUID(),
          token: verificationToken,
          email: user.email,
          userId: user.id,
          tokenTypeId: this.verificationTokenId,
          expiresAt: expiresAt,
        },
      });

      // Send verification email (async, outside transaction)
      setImmediate(() => {
        this.sendVerificationEmail(registerDto.email, verificationToken);
      });

      this.logger.log(
        `User registered successfully within transaction: ${user.email}`,
      );
      return user;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error(
        `Error registering user within transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  // Helper method to send verification email
  private async sendVerificationEmail(
    email: string,
    verificationToken: string,
  ): Promise<{ message: string }> {
    return this.emailService.resendAuthEmailOfType(
      email,
      'VERIFICACION_EMAIL',
      verificationToken,
    );
  }

  // done locally
  async login(
    loginDto: LoginDto,
    logintType: LoginType,
    res: Response,
  ): Promise<{ message: string; access: string; refresh: string }> {
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
      this.logger.warn(
        `Login attempt failed: User not found for email: ${loginDto.email}`,
      );
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (logintType === 'PASSWORD') {
      if (user.authMethod !== 'PASSWORD') {
        this.logger.warn(
          `Login attempt failed: User ${loginDto.email} does not use password authentication`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }

      if (!user.password) {
        this.logger.warn(
          `Login attempt failed: User ${loginDto.email} has no password set`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }

      if (!loginDto.password) {
        this.logger.warn(
          `Login attempt failed: No password provided for user: ${loginDto.email}`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }
      // Verify password using bcrypt
      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.password,
      );
      if (!isPasswordValid) {
        this.logger.warn(
          `Login attempt failed: Invalid password for user: ${loginDto.email}`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }
    } else {
      // loginType == 'ENTRA_ID'
      if (user.authMethod !== 'ENTRA_ID') {
        this.logger.warn(
          `Login attempt failed: User ${loginDto.email} does not use Entra ID authentication`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }

      if (!user.microsoftOid) {
        this.logger.warn(
          `Login attempt failed: User ${loginDto.email} has no Microsoft account linked`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }

      // Additional validation: verify the Microsoft OID matches if provided in loginDto
      if (
        loginDto.microsoftOid &&
        user.microsoftOid !== loginDto.microsoftOid
      ) {
        this.logger.warn(
          `Login attempt failed: Microsoft account mismatch for user: ${loginDto.email}`,
        );
        throw new UnauthorizedException('Invalid credentials.');
      }

      this.logger.log('Entra ID login validation passed');
    }

    // Check if user is active
    if (!user.isActive) {
      this.logger.warn(
        `Login attempt failed: User ${loginDto.email} is inactive`,
      );
      throw new UnauthorizedException('User account is currently inactive.');
    }

    // Generate JWT tokens
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.setAuthCookies(res, accessToken, refreshToken);
    this.logger.log(
      `Local authentication successful for user: ${loginDto.email}`,
    );

    this.updateLastSignIn(loginDto.email);

    return {
      message: 'Login successful',
      access: accessToken,
      refresh: refreshToken,
    };
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

  // This function gets the Authorize URL for Outlook login based on Microsoft Entra ID credentials
  getAuthorizeUrl() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state: 'xyz123',
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * When a user chooses to sign in with Microsoft Entra ID,
   * they get redirected to Microsoft's authorization endpoint. After they authenticate there,
   * Microsoft redirects back to our callback URL with an authorization code.
   * This function exchanges that code for tokens from Microsoft.
   * @param code The authorization code received from Microsoft
   * @returns The token response from Microsoft, including id_token and access_token
   */
  async exchangeCodeForToken(code: string) {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const data = new URLSearchParams({
      client_id: this.clientId,
      scope: 'openid profile email',
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      client_secret: this.clientSecret,
    });

    const response = await firstValueFrom(
      this.httpService.post(tokenEndpoint, data.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    return response.data;
  }

  /**
   * Handles the Microsoft Entra ID callback after user authentication.
   * If the user exists, logs them in.
   * @param code The authorization code received from Microsoft
   * @param res The Express response object to set cookies
   * @returns The result of the login process. 201 if succesful.
   */
  async handleMicrosoftCallback(code: string, res: Response) {
    try {
      // Exchange code for Microsoft tokens and extract user info
      const microsoftTokens = await this.exchangeCodeForToken(code);
      const userInfo = this.parseIdToken(microsoftTokens.id_token);

      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { email: userInfo.email },
      });

      if (!user) {
        throw new UnauthorizedException('User does not exist.');
      }

      // Handle first-time setup (if authMethod is null)
      if (user.authMethod === null) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            authMethod: 'ENTRA_ID',
            microsoftOid: userInfo.oid,
            isActive: true,
            confirmationStatusId: this.confirmedStatusId,
          },
        });
        await this.prisma.verificationToken.deleteMany({
          where: {
            userId: user.id,
            tokenTypeId: this.verificationTokenId,
          },
        });
        this.logger.log(
          `First-time Entra ID setup completed for user: ${user.email}`,
        );
      }

      // Use existing login method with Entra ID
      await this.login(
        { email: userInfo.email, microsoftOid: userInfo.oid },
        'ENTRA_ID',
        res,
      );

      // Successful login - redirect to frontend
      const REDIRECT_TO = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:5173',
      );
      return res.redirect(`${REDIRECT_TO}/inicio`);
    } catch (error) {
      // Log the error details
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Microsoft authentication failed:', {
        error: errorMessage,
        stack: errorStack,
        code: code ? 'provided' : 'missing',
      });

      // Redirect to error page with specific error info
      const errorType =
        error instanceof UnauthorizedException
          ? 'unauthorized'
          : 'server_error';
      const REDIRECT_TO = this.configService.get<string>(
        'FRONTEND_URL',
        `http://localhost:5173`,
      );
      return res.redirect(`${REDIRECT_TO}/auth-error?error=${errorType}`);
    }
  }

  /**
   * Parses the ID token received from Microsoft to extract user information.
   * @param idToken The ID token JWT string
   * @returns An object containing the user's OID, email, and name
   */
  private parseIdToken(idToken: string) {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64').toString(),
    );
    return {
      oid: payload.oid,
      email: payload.email || payload.unique_name || payload.preferred_username,
      name: payload.name,
    };
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
        this.logger.warn(
          `Refresh token user ${payload.email} not found or inactive`,
        );
        this.clearAuthCookies(res);
        throw new UnauthorizedException('User account is no longer active.');
      }

      // Generate new tokens
      const newPayload = { sub: user.id, email: user.email };
      const newAccessToken = this.jwtService.sign(newPayload, {
        expiresIn: '15m',
      });
      const newRefreshToken = this.jwtService.sign(newPayload, {
        expiresIn: '7d',
      });

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
      this.logger.warn(
        `Local user ${jwtPayload.sub} (${user.email}) is inactive`,
      );
      throw new UnauthorizedException('User account is inactive');
    }

    // Cache the user profile
    await this.cacheService.set(cacheKey, user, this.USER_PROFILE_CACHE_TTL);
    this.logger.debug(
      `Local user ${user.email} synced and cached successfully`,
    );

    return user;
  }

  /**
   * Retrieves the profile data for the currently authenticated user.
   */
  async getMyProfile(userId: string): Promise<Partial<User>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        lastSignInAt: true,
        role: { select: { id: true, name: true } },
        confirmationStatus: { select: { status: true } },
      },
    });

    if (!user) {
      this.logger.warn(
        `getMyProfile failed: User profile not found for ID ${userId}.`,
      );
      throw new NotFoundException('User profile not found.');
    }

    return user;
  }

  async invalidateUserProfileCache(userId: string): Promise<void> {
    const cacheKey = this.getUserProfileCacheKey(userId);
    await this.cacheService.delete(cacheKey);
    this.logger.log(`User profile cache invalidated for user ID: ${userId}`);
  }

  /**
   * Resends the confirmation email to the user.
   * @param email The email address of the user to resend the confirmation email to.
   * @throws {NotFoundException} If the user is not found in the local database.
   * @throws {ConflictException} If the user is already confirmed.
   * @throws {InternalServerErrorException} If there is an error sending the email.
   */
  // done locally
  async resendAuthEmailOfType(
    email: string,
    typeOfEmail: AuthEmailType,
  ): Promise<{ message: string }> {
    return this.emailService.resendAuthEmailOfType(email, typeOfEmail);
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
