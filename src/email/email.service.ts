/* eslint-disable prettier/prettier */
// src/email/email.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TeamEmailType } from './types/team-email.type';
import { AuthEmailType } from './types/email-type.type';
import { ConfigService } from '@nestjs/config';
import emailjs, { EmailJSResponseStatus } from '@emailjs/nodejs';
import { randomUUID } from 'node:crypto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private EMAIL_PUBLIC_API_KEY: string;
  private EMAIL_PRIVATE_API_KEY: string;
  private EMAIL_SERVICE_ID: string;
  private EMAIL_CONFIRMATION_TEMPLATE: string;
  private EMAIL_RESET_PASSWORD_TEMPLATE: string;
  private EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE: string;
  private EMAIL_VIDEOGAME_APPROVED_TEMPLATE: string;
  private EMAIL_VIDEOGAME_REJECTED_TEMPLATE: string;
  private EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE: string;
  private EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE: string;
  private EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE: string;
  private EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE: string;

  // Auth-related token IDs (will be set in onModuleInit)
  private verificationTokenId: number;
  private resetPasswordTokenId: number;

  private readonly VERIFICATION_TOKEN_NAME = 'VERIFICACION_EMAIL';
  private readonly RESET_PASSWORD_TOKEN_NAME = 'RESETEAR_CONTRASENA';
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}
  
  async onModuleInit() {
    this.logger.log(
      'Initializing EmailService: Fetching email templates and token types...',
    );
    try {
      // Initialize token types for auth emails
      const verificationToken = await this.prisma.tokenType.findUnique({
        where: { type: this.VERIFICATION_TOKEN_NAME },
      });
      const resetPasswordToken = await this.prisma.tokenType.findUnique({
        where: { type: this.RESET_PASSWORD_TOKEN_NAME },
      });

      if (!verificationToken) {
        throw new InternalServerErrorException(
          `FATAL: Token type '${this.VERIFICATION_TOKEN_NAME}' not found in database`,
        );
      }

      if (!resetPasswordToken) {
        throw new InternalServerErrorException(
          `FATAL: Token type '${this.RESET_PASSWORD_TOKEN_NAME}' not found in database`,
        );
      }

      this.verificationTokenId = verificationToken.id;
      this.resetPasswordTokenId = resetPasswordToken.id;

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
      const EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE = this.configService.get<string>(
        'EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE',
      );
      const EMAIL_VIDEOGAME_APPROVED_TEMPLATE = this.configService.get<string>(
        'EMAIL_VIDEOGAME_APPROVED_TEMPLATE',
      );
      const EMAIL_VIDEOGAME_REJECTED_TEMPLATE = this.configService.get<string>(
        'EMAIL_VIDEOGAME_REJECTED_TEMPLATE',
      );
      const EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE',
      );
      const EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE',
      );
      const EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE',
      );
      const EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE',
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
      else if (!EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE' not found. Application might not function correctly`,
        );
      else if (!EMAIL_VIDEOGAME_APPROVED_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_VIDEOGAME_APPROVED_TEMPLATE' not found. Application might not function correctly`,
        );
      else if (!EMAIL_VIDEOGAME_REJECTED_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_VIDEOGAME_REJECTED_TEMPLATE' not found. Application might not function correctly`,
        );
      else if (!EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE' not found. Application might not function correctly`,
        );
      else if (!EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE' not found. Application might not function correctly`,
        );
      else if (!EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE' not found. Application might not function correctly`,
        );
      else if (!EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE)
        throw new InternalServerErrorException(
          `FATAL: Configuration error during onModuleInit - 'EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE' not found. Application might not function correctly`,
        );

      this.EMAIL_PUBLIC_API_KEY = EMAIL_PUBLIC_API_KEY;
      this.EMAIL_PRIVATE_API_KEY = EMAIL_PRIVATE_API_KEY;
      this.EMAIL_SERVICE_ID = EMAIL_SERVICE_ID;
      this.EMAIL_CONFIRMATION_TEMPLATE = EMAIL_CONFIRMATION_TEMPLATE;
      this.EMAIL_RESET_PASSWORD_TEMPLATE = EMAIL_RESET_PASSWORD_TEMPLATE;
      this.EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE = EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE;
      this.EMAIL_VIDEOGAME_APPROVED_TEMPLATE = EMAIL_VIDEOGAME_APPROVED_TEMPLATE;
      this.EMAIL_VIDEOGAME_REJECTED_TEMPLATE = EMAIL_VIDEOGAME_REJECTED_TEMPLATE;
      this.EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE = EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE;
      this.EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE = EMAIL_FIRST_PLACE_CERTIFICATE_TEMPLATE;
      this.EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE = EMAIL_SECOND_PLACE_CERTIFICATE_TEMPLATE;
      this.EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE = EMAIL_THIRD_PLACE_CERTIFICATE_TEMPLATE;

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
    }
  }

  /**
   * Resets token expiration for a user's verification or reset password token
   */
  async resetTokenExpiration(userId: string, typeOfToken: AuthEmailType): Promise<void> {
    try {
      // Find the appropriate token type
      const tokenTypeId = typeOfToken === 'VERIFICACION_EMAIL' 
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
        throw new NotFoundException('No verification token found for this user.');
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
      this.logger.error(`Failed to reset token expiration: ${error instanceof Error ? error.message : String(error)}`);
      throw new InternalServerErrorException('Failed to reset token expiration.');
    }
  }

  /**
   * Sends a verification email to the specified email address
   */
  async sendVerificationEmail(email: string, verificationToken: string): Promise<void> {
    try {
      this.logger.log(`Sending verification email for '${email}'`);

      const REDIRECT_TO = this.configService.get<string>(
        'FRONTEND_URL',
        `http://localhost:5173`,
      );

      await this.sendEmailTemplate(this.EMAIL_CONFIRMATION_TEMPLATE, {
        email: email,
        confirmationURL: `${REDIRECT_TO}/verificar-cuenta?token=${verificationToken}`,
      });

      this.logger.log(`Verification email sent successfully to: ${email}`);
    } catch (error) {
      // Log email errors but don't fail the operation
      this.logger.error(
        `Failed to send verification email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Resends an email of the specified type (verification or password reset)
   */
  async resendEmailOfType(
    email: string,
    typeOfEmail: AuthEmailType,
  ): Promise<{ message: string }> {
    this.logger.log(`Attempting to resend ${typeOfEmail} email to: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { confirmationStatus: true },
    });

    if (!user) {
      this.logger.error(`User with email ${email} not found in local DB.`);
      throw new NotFoundException('The email address is not registered.');
    }

    if (
      typeOfEmail === 'VERIFICACION_EMAIL' &&
      user.confirmationStatus?.status === 'CONFIRMADO'
    ) {
      this.logger.warn(`User with email ${email} is already confirmed.`);
      throw new ConflictException('The email has already been confirmed.');
    }

    try {
      // Delete any existing token of said type for this user
      const tokenTypeId =
        typeOfEmail === 'VERIFICACION_EMAIL'
          ? this.verificationTokenId
          : this.resetPasswordTokenId;
      
      await this.prisma.verificationToken.deleteMany({
        where: {
          userId: user.id,
          tokenTypeId: tokenTypeId,
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
          tokenTypeId: tokenTypeId,
          expiresAt: expiresAt,
        },
      });

      // Determine the email template based on typeOfEmail
      let template: string;
      let templateParams: Record<string, unknown>;

      if (typeOfEmail === 'VERIFICACION_EMAIL') {
        template = this.EMAIL_CONFIRMATION_TEMPLATE;
        templateParams = {
          email: email,
          confirmationURL: `${REDIRECT_TO}/verificar-cuenta?token=${verificationToken}`,
        };
      } else if (typeOfEmail === 'RESETEAR_CONTRASENA') {
        // Get user's display name (firstName or lastName/email as fallback)
        const userName = user.firstName
          ? user.firstName.trim()
          : user.lastName || user.email.split('@')[0];

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
      await this.sendEmailTemplate(template, templateParams);

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Correo reenviado con éxito' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to resend ${typeOfEmail} email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to resend email.');
    }
  }

  /**
   * Sends an email template to a given email address
   */
  async sendEmailTemplate(
    template: string,
    templateParams: Record<string, unknown>,
  ): Promise<void> {
    try {
      this.logger.log(
        `Attempting to send email to ${templateParams.email} via EmailJS.`,
      );

      await emailjs.send(this.EMAIL_SERVICE_ID, template, templateParams);

      this.logger.log(`Email sent successfully via EmailJS`);
    } catch (error) {
      if (error instanceof EmailJSResponseStatus) {
        this.logger.error(`EmailJS service failed: ${JSON.stringify(error)}`);
        throw new InternalServerErrorException(
          'An error occurred while preparing the verification email',
        );
      }

      this.logger.error(error);
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        'An error occurred while preparing the verification email.',
      );
    }
  }
}