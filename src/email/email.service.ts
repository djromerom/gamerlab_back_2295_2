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
import { CertificatesService } from 'src/certificates/certificates.service';
import { TeamEmailType, TEAM_EMAIL_CONFIG } from './types/team-email.type';
import { AuthEmailType, AUTH_EMAIL_CONFIG } from './types/email-type.type';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { randomUUID } from 'node:crypto';
import { CertEmailType, CERT_EMAIL_CONFIG } from './types/cert-email.type';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private emailClient: EmailClient | null = null;
  private senderAddress: string = '';

  // Auth-related token IDs (will be set in onModuleInit)
  private verificationTokenId: number;
  private resetPasswordTokenId: number;

  private readonly VERIFICATION_TOKEN_NAME = 'VERIFICACION_EMAIL';
  private readonly RESET_PASSWORD_TOKEN_NAME = 'RESETEAR_CONTRASENA';

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificatesService: CertificatesService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * INICIALIZACIÓN DEL MÓDULO (Ejecutado por NestJS al arrancar el servidor)
   * Aquí leemos las variables de entorno asociadas a Azure Communication Services (.env).
   * Si las credenciales faltan, desactivamos el emailClient para no colapsar la app.
   */
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

      this.logger.log('Setting up Azure Communication Services EmailClient');
      const acsConnectionString = this.configService.get<string>(
        'ACS_CONNECTION_STRING',
      );
      const acsSenderAddress =
        this.configService.get<string>('ACS_SENDER_ADDRESS');

      if (
        acsConnectionString &&
        acsSenderAddress &&
        acsSenderAddress !== 'Donotreply@<domain>.azurecomm.net'
      ) {
        this.emailClient = new EmailClient(acsConnectionString);
        this.senderAddress = acsSenderAddress;
        this.logger.log('ACS EmailClient successfully initialized');
      } else {
        this.logger.warn(
          'ACS credentials not fully configured. EmailService will run in SIMULATION mode.',
        );
      }
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Failed to initialize confirmation statuses: ${error.message}`,
          error.stack,
        );
    }
  }

  /**
   * REENVÍO DE CORREOS DE AUTENTICACIÓN (AuthModule)
   *
   * Esta función es llamada cuando el usuario solicita que se le re-envíe el correo,
   * ya sea para verificar su cuenta o para resetear contraseña.
   *
   * @param email Correo del usuario que originó la petición.
   * @param typeOfEmail Tipo de acción (ej. 'VERIFICACION_EMAIL' o 'RESETEAR_CONTRASENA').
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

      /*
      * Leer la configuración del tipo de correo
      * (template, subject) 
      * Proviene de ./types/email-type.type.ts
      */
      const authConfig = AUTH_EMAIL_CONFIG[typeOfEmail];
      if (!authConfig) {
        this.logger.error(`Invalid email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid email type specified.');
      }

      const { template: templateName, subject } = authConfig;

      let templateParams: Record<string, unknown>;
      if (typeOfEmail === 'VERIFICACION_EMAIL') {
        templateParams = {
          email,
          confirmationURL: `${REDIRECT_TO}/verificar-cuenta?token=${verificationToken}`,
        };
      } else {
        const userName = user.firstName
          ? user.firstName.trim()
          : user.lastName || user.email.split('@')[0];
        templateParams = {
          email,
          user_name: userName,
          resetPasswordURL: `${REDIRECT_TO}/establecer-contrasena?token=${verificationToken}`,
        };
      }

      // Send new verification email usando nuestro gestor de Handlebars+ACS
      await this.sendEmail(email, subject, templateName, templateParams);

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent successfully' };
    } catch (error) {
      this.handleResendError(error, typeOfEmail, email, { rethrow: [ConflictException] });
    }
  }

  /**
   * REENVÍO DE CORREOS DEL EQUIPO (TeamsModule)
   *
   * Usado para notificar al equipo que su videojuego fue aprobado o rechazado,
   * o cuando hay un update en la info del juego.
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

      const teamConfig = TEAM_EMAIL_CONFIG[typeOfEmail];
      if (!teamConfig) {
        this.logger.error(`Invalid team email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid team email type specified.');
      }

      /*
      * Leer la configuración del tipo de correo
      * (template, subject) 
      * Proviene de ./types/team-email.type.ts
      */
      const { template: templateName, subject } = teamConfig;
      let templateParams: Record<string, unknown> = { email };

      if (typeOfEmail === 'VIDEOGAME_APPROVED') {
        const videogame = await this.prisma.videogame.findFirst({
          where: { team: { members: { some: { email } } } },
          select: { name: true },
        });
        templateParams['videogameName'] = videogame?.name || '';
      }

      if (params) {
        templateParams = { ...templateParams, ...params };
      }

      // Enviar correo de notificación del equipo
      await this.sendEmail(email, subject, templateName, templateParams);

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent successfully' };
    } catch (error) {
      this.handleResendError(error, typeOfEmail, email);
    }
  }

  /**
   * REENVÍO DE CERTIFICADOS A MIEMBROS (CertificatesModule)
   *
   * Función encargada de adjuntar el resultado de `generateCertificateHtml` en Puppeteer
   * y despachar un correo con el adjunto.
   * IMPORTANTE: También requiere la migración de sus plantillas a .hbs local.
   */
  async resendCertEmailOfType(
    email: string,
    typeOfEmail: CertEmailType,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Attempting to resend ${typeOfEmail} certificate email to: ${email}`,
    );

    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        this.logger.error(`User with email ${email} not found in local DB.`);
        throw new NotFoundException('The email address is not registered.');
      }

      // Find the team that this user is a member of (by user id)
      const team = user
        ? await this.prisma.team.findFirst({
          where: { user: { id: user.id } },
          select: { id: true },
        })
        : null;

      if (!team) {
        this.logger.error(
          `User with email ${email} is not connected to any team.`,
        );
        throw new NotFoundException('The user is not connected to any team.');
      }

      const emails = await this.prisma.member
        .findMany({
          where: { teamId: team.id },
          select: { email: true },
        })
        .then((members) => members.map((member) => member.email));

      const teamId = team.id;

      /*
      * Leer la configuración del tipo de correo
      * (template, subject, certIndex) 
      * Proviene de ./types/cert-email.type.ts
      */
      const certConfig = CERT_EMAIL_CONFIG[typeOfEmail];
      if (!certConfig) {
        this.logger.error(`Invalid certificate email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid certificate email type specified.');
      }

      const { template: templateName, subject, certIndex } = certConfig;
      const pdfBuffer = await this.certificatesService.generateCertificateHtml(teamId, certIndex);

      const attachments = [{
        name: `${typeOfEmail}.pdf`,
        contentType: 'application/pdf',
        contentInBase64: pdfBuffer.toString('base64')
      }];

      let templateParams: Record<string, unknown> = {
        email: emails.join(', '),
      };

      // Disparar correo de certificado con el PDF adjunto
      await this.sendEmail(email, subject, templateName, templateParams, attachments);

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent successfully' };
    } catch (error) {
      this.handleResendError(error, typeOfEmail, email, { isCert: true });
    }
  }
  /**
   * MÉTODOLOGÍ: ACS + HANDLEBARS LOCAL
   *
   * Esta función mejora el rendimiento de tu aplicación:
   * 1. Elimina la latencia de consultar APIs de plantillas en un tercero (EmailJS).
   * 2. El proceso String Interpolation vía `handlebars` consume microsegundos de CPU.
   * 3. ACS absorbe directamente el HTML puro, ahorrándonos costos operativos en volúmenes.
   *
   * @param to Correo destinatario
   * @param subject Asunto
   * @param templateName Nombre del archivo .hbs (ej. "verification", sin extensión)
   * @param templateParams Estructura de llaves y valores (ej. {{email}}) a inyectar en la plantilla.
   * @param attachments Opcional: Arreglo de adjuntos con nombre, tipo y base64.
   */
  async sendEmail(
    to: string,
    subject: string,
    templateName: string,
    templateParams: Record<string, unknown>,
    attachments?: { name: string; contentType: string; contentInBase64: string }[]
  ): Promise<void> {
    try {
      this.logger.log(
        `[EmailService] Compilando plantilla local: ${templateName}.hbs`,
      );

      // PASO 1: Ubicación Física del diseño.
      // Construimos de forma absoluta la ruta a nuestra carpeta local `src/email/templates/`.
      const tplPath = path.join(
        process.cwd(),
        'src/email/templates',
        `${templateName}.hbs`,
      );

      // Cerciórate de que el archivo existe en disco para no mandar un mail vacío o quebrar la API.
      if (!fs.existsSync(tplPath)) {
        throw new InternalServerErrorException(
          `No se encontró el diseño en: ${tplPath}`,
        );
      }

      // PASO 2: Data-Binding (Compilación).
      // fs lee la estructura HBS. handlebars interpreta etiquetas {{variable}} y genera HTML inyectado.
      const source = fs.readFileSync(tplPath, 'utf8');
      const compiledTemplate = handlebars.compile(source);
      const htmlContent = compiledTemplate(templateParams); // <- Ya es puramente HTML generado en <1ms

      // PASO 3: Ensamblado SDK Azure Communication Services
      const message: any = {
        senderAddress: this.senderAddress,
        content: {
          subject: subject,
          html: htmlContent, // A ACS no le importa cómo hicimos el HTML, mientras lo entreguemos listo.
        },
        recipients: {
          to: [{ address: to }],
        },
      };

      // Si vienen adjuntos genéricos o PDFs de validación (Certificados), se los colamos al message:
      if (attachments && attachments.length > 0) {
        message.attachments = attachments;
      }

      // PASO 4: Enrutamiento Final o Modo Simulación.
      // Si la config principal falló en el moduleInit (faltaba .env), this.emailClient es null.
      if (this.emailClient) {
        this.logger.log(`Enviando carga útil a ACS apuntando a ${to}...`);

        // Poller de larga duración: ACS toma el pedido y esperamos hasta que termine su cola nativa.
        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();

        this.logger.log(`✅ ¡Éxito! Correo disparado vía Azure ACS.`);
      } else {
        // En ambiente DEV pre-llaves, esto "imita" el éxito para no frenar tu QA Local.
        this.logger.warn(
          `⚠️ [MODO DEV] Plantilla compilada correctamente. Cancelando interred (Falso Positivo) al no detectar llaves de ACS.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Excepción capturada enviando correo vía ACS: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Desvío capturado en el envio local/externo de correos.',
      );
    }
  }

  /**
   * Helper privado para manejar errores de reenvío de forma uniforme.
   * Re-lanza excepciones conocidas (rethrowClasses).
   * Para el resto, loggea y lanza InternalServerErrorException.
   */
  private handleResendError(
    error: unknown,
    typeOfEmail: string,
    email: string,
    options: { isCert?: boolean; rethrow?: (new (...args: any[]) => any)[] } = {},
  ): never {
    const rethrowClasses = [
      NotFoundException,
      BadRequestException,
      ...(options.rethrow ?? []),
    ];
    if (rethrowClasses.some((Ex) => error instanceof Ex)) throw error as Error;

    const label = options.isCert ? 'certificate email' : 'email';
    this.logger.error(
      `Failed to resend ${typeOfEmail} ${label} to ${email}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    throw new InternalServerErrorException('Failed to resend email.');
  }
}
