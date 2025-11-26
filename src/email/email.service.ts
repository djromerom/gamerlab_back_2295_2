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
import { CertEmailType } from './types/cert-email.type';

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
  private EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE: string;
  private EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE: string;
  private EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE: string;

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
      const EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE',
      );
      const EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE',
      );
      const EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE = this.configService.get<string>(
        'EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE',
      );

      const requiredConfigs = [
        { key: 'EMAIL_PUBLIC_API_KEY', value: EMAIL_PUBLIC_API_KEY },
        { key: 'EMAIL_PRIVATE_API_KEY', value: EMAIL_PRIVATE_API_KEY },
        { key: 'EMAIL_SERVICE_ID', value: EMAIL_SERVICE_ID },
        { key: 'EMAIL_CONFIRMATION_TEMPLATE', value: EMAIL_CONFIRMATION_TEMPLATE },
        { key: 'EMAIL_RESET_PASSWORD_TEMPLATE', value: EMAIL_RESET_PASSWORD_TEMPLATE },
        { key: 'EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE', value: EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE },
        { key: 'EMAIL_VIDEOGAME_APPROVED_TEMPLATE', value: EMAIL_VIDEOGAME_APPROVED_TEMPLATE },
        { key: 'EMAIL_VIDEOGAME_REJECTED_TEMPLATE', value: EMAIL_VIDEOGAME_REJECTED_TEMPLATE },
        { key: 'EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE', value: EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE },
        { key: 'EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE', value: EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE },
        { key: 'EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE', value: EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE },
        { key: 'EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE', value: EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE },
      ];
      for (const config of requiredConfigs) {
        if (!config.value) {
          throw new InternalServerErrorException(
            `FATAL: Configuration error during onModuleInit - '${config.key}' not found. Application might not function correctly`,
          );
        }
      }

      this.EMAIL_PUBLIC_API_KEY = EMAIL_PUBLIC_API_KEY!;
      this.EMAIL_PRIVATE_API_KEY = EMAIL_PRIVATE_API_KEY!;
      this.EMAIL_SERVICE_ID = EMAIL_SERVICE_ID!;
      this.EMAIL_CONFIRMATION_TEMPLATE = EMAIL_CONFIRMATION_TEMPLATE!;
      this.EMAIL_RESET_PASSWORD_TEMPLATE = EMAIL_RESET_PASSWORD_TEMPLATE!;
      this.EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE = EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE!;
      this.EMAIL_VIDEOGAME_APPROVED_TEMPLATE = EMAIL_VIDEOGAME_APPROVED_TEMPLATE!;
      this.EMAIL_VIDEOGAME_REJECTED_TEMPLATE = EMAIL_VIDEOGAME_REJECTED_TEMPLATE!;
      this.EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE = EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE!;
      this.EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE = EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE!;
      this.EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE = EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE!;
      this.EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE = EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE!;

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
   * Resends an email of the specified type (verification or password reset)
   */
  async resendAuthEmailOfType(
    email: string,
    typeOfEmail: AuthEmailType,
    token?: string,
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
      // Generate new verification token
      const REDIRECT_TO = this.configService.get<string>(
        'FRONTEND_URL',
        `http://localhost:5173`,
      );

      let verificationToken: string;
      
      if (token === undefined) {
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

        const TOKEN_EXPIRATION_TIME = this.configService.get<number>(
          'REGISTRATION_TOKEN_EXPIRATION',
          24,
        );

        verificationToken = randomUUID();
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
      } else {
        // Use the provided token
        verificationToken = token;
      }

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
      return { message: 'Email resent succesfully' };
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
   * Resends a team-related email of the specified type
   * @param email The recipient's email address
   * @param typeOfEmail The type of team email to resend
   * @param params Additional parameters required for the email template
   */
  async resendTeamEmailOfType(
    email: string,
    typeOfEmail: TeamEmailType,
    params?: Record<string, unknown>,
  ): Promise<{ message: string }> {
    this.logger.log(`Attempting to resend ${typeOfEmail} email to: ${email}`);
  
    try {
      const emailExists = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!emailExists) {
        this.logger.error(`User with email ${email} not found in local DB.`);
        throw new NotFoundException('The email address is not registered.');
      }
      
      let template: string;
      let templateParams: Record<string, unknown> = { email };
      switch (typeOfEmail) {
        case 'UPDATE_VIDEOGAME_INFO':
          template = this.EMAIL_UPDATE_VIDEOGAME_INFO_TEMPLATE;
          break;
        case 'VIDEOGAME_APPROVED':
          template = this.EMAIL_VIDEOGAME_APPROVED_TEMPLATE;
          break;
        case 'VIDEOGAME_REJECTED':
          template = this.EMAIL_VIDEOGAME_REJECTED_TEMPLATE;
          break;
        default:
          this.logger.error(`Invalid team email type specified: ${typeOfEmail}`);
          throw new BadRequestException('Invalid team email type specified.');
      }
  
      // Merge additional params if provided
      if (params) {
        templateParams = { ...templateParams, ...params };
      }
  
      // Send the email
      await this.sendEmailTemplate(template, templateParams);
  
      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent succesfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
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
   * Resends a team certificate email of the specified type
   * @param email The recipient's email address
   * @param typeOfEmail The type of certificate email to resend
   * @param certificate The certificate file to include in the email
   */
  async resendCertEmailOfType(
    email: string,
    typeOfEmail: CertEmailType,
    certificate: string,
  ): Promise<{ message: string }> {
    this.logger.log(`Attempting to resend ${typeOfEmail} certificate email to: ${email}`);
  
    try {
      const emailExists = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!emailExists) {
        this.logger.error(`User with email ${email} not found in local DB.`);
        throw new NotFoundException('The email address is not registered.');
      }
      
      let template: string;
      let templateParams: Record<string, unknown> = { 
        email,
        certificate: certificate,
      };
      switch (typeOfEmail) {
        case 'PARTICIPATION_CERTIFICATE':
          template = this.EMAIL_PARTICIPATION_CERTIFICATE_TEMPLATE;
          break;
        case '1ST_PLACE_CERTIFICATE':
          template = this.EMAIL_1ST_PLACE_CERTIFICATE_TEMPLATE;
          break;
        case '2ND_PLACE_CERTIFICATE':
          template = this.EMAIL_2ND_PLACE_CERTIFICATE_TEMPLATE;
          break;
        case '3RD_PLACE_CERTIFICATE':
          template = this.EMAIL_3RD_PLACE_CERTIFICATE_TEMPLATE;
          break;
        default:
          this.logger.error(`Invalid certificate email type specified: ${typeOfEmail}`);
          throw new BadRequestException('Invalid certificate email type specified.');
      }
  
      // Send the email
      await this.sendEmailTemplate(template, templateParams);
  
      this.logger.log(`${typeOfEmail} certificate email resent successfully to: ${email}`);
      return { message: 'Email resent succesfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to resend ${typeOfEmail} certificate email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
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
        `Attempting to send email using template '${template}' to ${templateParams.email} via EmailJS.`,
      );

      await emailjs.send(this.EMAIL_SERVICE_ID, template, templateParams);

      this.logger.log(`Email sent successfully via EmailJS`);
    } catch (error) {
      if (error instanceof EmailJSResponseStatus) {
        this.logger.error(`EmailJS service failed: ${JSON.stringify(error)}`);
        throw new InternalServerErrorException(
          'An error occurred while sending the email',
        );
      }

      this.logger.error(error);
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        'An error occurred while sending the email.',
      );
    }
  }
}