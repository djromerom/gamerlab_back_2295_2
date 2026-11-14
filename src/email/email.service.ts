/* eslint-disable prettier/prettier */
// src/email/email.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CertificatesService } from 'src/certificates/certificates.service';
import { TeamEmailType, TEAM_EMAIL_CONFIG } from './types/team-email.type';
import { AuthEmailType, AUTH_EMAIL_CONFIG } from './types/email-type.type';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { randomUUID } from 'node:crypto';
import { CertEmailType, CERT_EMAIL_CONFIG } from './types/cert-email.type';

import { EmailClient } from '@azure/communication-email';
import { RestError } from '@azure/core-rest-pipeline';
import { findUserByEmailCaseInsensitive } from '../common/utils/find-user-by-email';
import { ActiveEdition, findActiveEdition } from '../editions/active-edition';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import { JUROR_ROLE_NAME } from '../juror-badges/juror-label';
import { assertJurorOfEdition, eventDayOf } from '../certificates/certificate-eligibility';
import { fairDateLong } from '../certificates/external-presenter-certificate';
import { fairNameOf } from '../certificates/fair-name';

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
    @Inject(forwardRef(() => CertificatesService))
    private readonly certificatesService: CertificatesService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Fecha, hora y lugar del evento, leídos de EVENT_DATE_TEXT, EVENT_TIME_TEXT
   * y EVENT_PLACE_TEXT. Sin valores por defecto: si falta alguna se falla con
   * un mensaje claro en lugar de enviar un dato fijo desactualizado.
   */
  getEventInfo(): { eventDate: string; eventTime: string; eventPlace: string } {
    const read = (name: string): string => {
      const value = this.configService.get<string>(name)?.trim();
      if (!value) {
        throw new InternalServerErrorException(
          `Configuración faltante: defina la variable de entorno ${name} (fecha, hora y lugar del evento).`,
        );
      }
      return value;
    };
    return {
      eventDate: read('EVENT_DATE_TEXT'),
      eventTime: read('EVENT_TIME_TEXT'),
      eventPlace: read('EVENT_PLACE_TEXT'),
    };
  }

  /**
   * Variante tolerante para el correo de verificación: devuelve solo las
   * variables presentes y registra el error (sin datos personales) por las
   * que faltan, para que el correo se envíe igual sin esas líneas.
   */
  private getOptionalEventInfo(): Partial<ReturnType<EmailService['getEventInfo']>> {
    const vars = {
      eventDate: 'EVENT_DATE_TEXT',
      eventTime: 'EVENT_TIME_TEXT',
      eventPlace: 'EVENT_PLACE_TEXT',
    } as const;
    const info: Record<string, string> = {};
    const missing: string[] = [];
    for (const [key, name] of Object.entries(vars)) {
      const value = this.configService.get<string>(name)?.trim();
      if (value) info[key] = value;
      else missing.push(name);
    }
    if (missing.length > 0) {
      this.logger.error(
        `Configuración faltante: defina ${missing.join(', ')}. El correo de verificación se envía sin esas líneas.`,
      );
    }
    return info;
  }

  /** ARK-170 (TA-19): "26 de noviembre de 2026", la fecha del evento de la edición activa. */
  private async getCertificateEventDate(edition: ActiveEdition): Promise<string> {
    return fairDateLong(await eventDayOf(this.prisma, edition));
  }

  /** La edición que se certifica: siempre la activa (sin ella no se sabe el año del evento). */
  private async requireCertificateEdition(): Promise<ActiveEdition> {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) {
      throw new InternalServerErrorException(
        'Configuración faltante: no hay una edición activa para determinar el año del evento.',
      );
    }
    return edition;
  }

  /**
   * INICIALIZACIÓN DEL MÓDULO (Ejecutado por NestJS al arrancar el servidor)
   */
  async onModuleInit() {
    const missingEventVars = ['EVENT_DATE_TEXT', 'EVENT_TIME_TEXT', 'EVENT_PLACE_TEXT'].filter(
      (name) => !this.configService.get<string>(name)?.trim(),
    );
    if (missingEventVars.length > 0) {
      this.logger.warn(
        `Faltan variables de entorno del evento: ${missingEventVars.join(', ')}. El correo de verificación omitirá esas líneas y los certificados no se generarán.`,
      );
    }
    this.logger.log(
      'Initializing EmailService: Fetching email templates and token types...',
    );
    try {
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
      const acsConnectionString = this.configService.get<string>('ACS_CONNECTION_STRING');
      const acsSenderAddress = this.configService.get<string>('ACS_SENDER_ADDRESS');

      if (
        acsConnectionString &&
        acsSenderAddress
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
   */
  async resendAuthEmailOfType(
    email: string,
    typeOfEmail: AuthEmailType,
    token?: string,
  ): Promise<{ message: string }> {
    this.logger.log(`Attempting to resend ${typeOfEmail} email to: ${email}`);

    // I4 without wildcards (C1): `juan_perez@` must never find `juan.perez@`
    const user = await findUserByEmailCaseInsensitive(this.prisma, email, {
      confirmationStatus: true,
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
      const REDIRECT_TO = this.configService.get<string>(
        'FRONTEND_URL',
        `http://localhost:5173`,
      );

      let verificationToken: string;

      if (token === undefined) {
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
        );

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
        verificationToken = token;
      }

      const authConfig = AUTH_EMAIL_CONFIG[typeOfEmail];
      if (!authConfig) {
        this.logger.error(`Invalid email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid email type specified.');
      }

      const { template: templateName, subject } = authConfig;

      let templateParams: Record<string, unknown>;
      if (typeOfEmail === 'VERIFICACION_EMAIL') {
        templateParams = {
          confirmationURL: `${REDIRECT_TO}/verificar-cuenta?token=${verificationToken}`,
          ...this.getOptionalEventInfo(),
        };
      } else {
        const userName = user.firstName
          ? user.firstName.trim()
          : user.lastName || user.email.split('@')[0];
        templateParams = {
          user_name: userName,
          resetPasswordURL: `${REDIRECT_TO}/establecer-contrasena?token=${verificationToken}`,
        };
      }

      // Always the stored address of the user found, never the one in the request
      await this.sendEmail(user.email, subject, templateName, templateParams);

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent successfully' };
    } catch (error) {
      this.handleResendError(error, typeOfEmail, email, { rethrow: [ConflictException] });
    }
  }

  /**
   * REENVÍO DE CORREOS DEL EQUIPO (TeamsModule)
   */
  async resendTeamEmailOfType(
    email: string,
    typeOfEmail: TeamEmailType,
    params?: Record<string, unknown>,
  ): Promise<{ message: string }> {
    this.logger.log(`Attempting to resend ${typeOfEmail} email to: ${email}`);

    try {
      const emailExists = await findUserByEmailCaseInsensitive(
        this.prisma,
        email,
      );

      if (!emailExists) {
        this.logger.error(`User with email ${email} not found in local DB.`);
        throw new NotFoundException('The email address is not registered.');
      }

      const teamConfig = TEAM_EMAIL_CONFIG[typeOfEmail];
      if (!teamConfig) {
        this.logger.error(`Invalid team email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid team email type specified.');
      }

      const { template: templateName, subject } = teamConfig;
      let templateParams: Record<string, unknown> = { email };

      if (typeOfEmail === 'VIDEOGAME_APPROVED') {
        const videogame = await this.prisma.videogame.findFirst({
          where: { team: { members: { some: { email } } } },
          select: { name: true },
        });
        templateParams['videogameName'] = videogame?.name || '';
        templateParams['eventDate'] = this.getEventInfo().eventDate;
      }

      if (params) {
        templateParams = { ...templateParams, ...params };
      }

      await this.sendEmail(
        emailExists.email,
        subject,
        templateName,
        templateParams,
      );

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent successfully' };
    } catch (error) {
      this.handleResendError(error, typeOfEmail, email);
    }
  }

  /**
   * REENVÍO DE CERTIFICADOS A MIEMBROS (CertificatesModule)
   */
  async resendCertEmailOfType(
    email: string,
    typeOfEmail: CertEmailType,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Attempting to resend ${typeOfEmail} certificate email to: ${email}`,
    );

    try {
      const user = await findUserByEmailCaseInsensitive(this.prisma, email);

      if (!user) {
        this.logger.error(`User with email ${email} not found in local DB.`);
        throw new NotFoundException('The email address is not registered.');
      }

      const certConfig = CERT_EMAIL_CONFIG[typeOfEmail];
      if (!certConfig) {
        this.logger.error(`Invalid certificate email type specified: ${typeOfEmail}`);
        throw new BadRequestException('Invalid certificate email type specified.');
      }

      // ARK-170 (TA-19): solo el equipo del líder en la edición activa, activo y confirmado.
      const team = await this.certificatesService.findCertifiableTeam({ userId: user.id });

      const { template: templateName, subject, certIndex } = certConfig;
      const pdfBuffer = await this.certificatesService.generateTeamCertificatePdf(team, certIndex);

      const attachments = [{
        name: `${typeOfEmail}.pdf`,
        contentType: 'application/pdf',
        contentInBase64: pdfBuffer.toString('base64')
      }];

      let templateParams: Record<string, unknown> = {
        email: team.memberEmails.join(', '),
      };

      await this.sendEmail(
        user.email,
        subject,
        templateName,
        templateParams,
        attachments,
      );

      this.logger.log(`${typeOfEmail} email resent successfully to: ${email}`);
      return { message: 'Email resent successfully' };
    } catch (error) {
      this.handleResendError(error, typeOfEmail, email, { isCert: true });
    }
  }

  /**
   * ENVÍO DE CERTIFICADOS A TODOS LOS JURADOS
   *
   * Obtiene todos los usuarios con rol de Jurado activos,
   * genera el PDF de cada uno y lo despacha por email.
   * Procesa en secuencia para no saturar Puppeteer ni ACS.
   */
  async sendAllJurorCertificates(): Promise<{ message: string; sent: number; failed: number; errors: string[] }> {
    this.logger.log('Starting bulk juror certificate sending...');

    // ARK-135 (BG-22): el certificado es de la edición activa. Solo lo reciben los jurados
    // (rol Jurado) que participan en ella según HU-25 (`jurorsOfEdition`: confirmados en
    // Jurados de la edición); antes se enviaba a todo jurado activo, aunque fuera de otra feria.
    const edition = await this.requireCertificateEdition();
    const jurors = await this.prisma.user.findMany({
      where: {
        AND: [jurorsOfEdition(edition.id), { role: { name: JUROR_ROLE_NAME } }],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (jurors.length === 0) {
      return {
        message: `No hay jurados confirmados en «${edition.title}» para enviar certificados.`,
        sent: 0,
        failed: 0,
        errors: [],
      };
    }

    // Falla antes de generar PDFs si falta la configuración del evento.
    const eventDateWithYear = await this.getCertificateEventDate(edition);

    this.logger.log(`Found ${jurors.length} active jurors. Sending certificates...`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Procesar en secuencia — Puppeteer no soporta bien la concurrencia alta
    for (const juror of jurors) {
      try {
        const jurorName = `${juror.firstName} ${juror.lastName}`;
        const pdfBuffer = await this.certificatesService.generateJurorCertificateHtml(juror.id);

        const attachments = [{
          name: 'certificado-jurado.pdf',
          contentType: 'application/pdf',
          contentInBase64: pdfBuffer.toString('base64'),
        }];

        await this.sendEmail(
          juror.email,
          `Tu certificado de participación — ${fairNameOf(edition)}`,
          'juror_certificate',
          { jurorName, eventDateWithYear, fairName: fairNameOf(edition) },
          attachments,
        );

        sent++;
        this.logger.log(`✅ Certificate sent to ${juror.email} (${sent}/${jurors.length})`);
      } catch (err) {
        failed++;
        const errMsg = `${juror.email}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(errMsg);
        this.logger.error(`❌ Failed to send certificate to ${juror.email}: ${errMsg}`);
      }
    }

    this.logger.log(`Bulk send complete. Sent: ${sent}, Failed: ${failed}`);
    return {
      message: `Certificados enviados: ${sent} exitosos, ${failed} fallidos.`,
      sent,
      failed,
      errors,
    };
  }

  /**
   * ENVÍO DE CERTIFICADO A JURADO
   *
   * Los jurados son Users en la DB. Se busca por userId (UUID),
   * se genera el PDF y se despacha al email del usuario.
   *
   * @param userId UUID del usuario jurado
   */
  async resendJurorCertEmail(userId: string): Promise<{ message: string }> {
    this.logger.log(`Generating juror certificate for userId: ${userId}`);

    try {
      // 1. Buscar el User (jurado) por su UUID
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`User (juror) with id ${userId} not found`);
      }

      const jurorName = `${user.firstName} ${user.lastName}`;
      const edition = await this.requireCertificateEdition();
      const eventDateWithYear = await this.getCertificateEventDate(edition);

      // ARK-135 (BG-22): jurado confirmado en Jurados de la edición o profesor con un NRC activo.
      await assertJurorOfEdition(this.prisma, edition, userId, jurorName);

      // 2. Generar el PDF
      const pdfBuffer = await this.certificatesService.generateJurorCertificateHtml(userId);

      const attachments = [{
        name: 'certificado-jurado.pdf',
        contentType: 'application/pdf',
        contentInBase64: pdfBuffer.toString('base64'),
      }];

      // 3. Enviar el email con el PDF adjunto
      await this.sendEmail(
        user.email,
        `Tu certificado de participación — ${fairNameOf(edition)}`,
        'juror_certificate',   // → src/email/templates/juror_certificate.hbs
        { jurorName, eventDateWithYear, fairName: fairNameOf(edition) },
        attachments,
      );

      this.logger.log(`Juror certificate sent successfully to: ${user.email}`);
      return { message: 'Juror certificate email sent successfully' };
    } catch (error) {
      this.handleResendError(error, 'JUROR_CERTIFICATE', userId, { isCert: true });
    }
  }

  /**
   * HU-22 (ARK-84): true si hay claves de ACS. Sin ellas, en desarrollo `sendEmail` no envía nada
   * (modo simulación) y quien registra el resultado del envío lo anota como omitido.
   */
  isConfigured(): boolean {
    return this.emailClient !== null;
  }

  /**
   * MÉTODOLOGÍA: ACS + HANDLEBARS LOCAL
   */
  async sendEmail(
    to: string,
    subject: string,
    templateName: string,
    templateParams: Record<string, unknown>,
    attachments?: { name: string; contentType: string; contentInBase64: string }[]
  ): Promise<void> {
    try {
      this.logger.log(`Compilando plantilla local: ${templateName}.hbs`);

      const tplPath = path.join(
        __dirname,
        'templates',
        `${templateName}.hbs`,
      );

      if (!fs.existsSync(tplPath)) {
        throw new InternalServerErrorException(
          `No se encontró el diseño en: ${tplPath}`,
        );
      }

      const source = fs.readFileSync(tplPath, 'utf8');
      const compiledTemplate = handlebars.compile(source);
      const htmlContent = compiledTemplate(templateParams);

      const message: any = {
        senderAddress: this.senderAddress,
        content: {
          subject: subject,
          html: htmlContent,
        },
        recipients: {
          to: [{ address: to }],
        },
      };

      if (attachments && attachments.length > 0) {
        message.attachments = attachments;
      }

      if (this.emailClient) {
        const client = this.emailClient;
        this.logger.log(`Enviando carga útil a ACS apuntando a ${to}...`);

        const result = await this.withRetry(
          async () => {
            const poller = await client.beginSend(message, {
              abortSignal: AbortSignal.timeout(15_000), // 15 segundos máximo
            });
            return poller.pollUntilDone();
          },
          to,
        );

        if (!result || result.status !== 'Succeeded') {
          this.logger.error(`[ACS] Envío no exitoso: ${result?.status}`);
          throw new ServiceUnavailableException(
            `ACS terminó con estado: ${result?.status ?? 'unknown'}`,
          );
        }

        this.logger.log(`✅ Correo disparado vía Azure ACS (operación ${result.id}).`);
      } else if (this.configService.get<string>('NODE_ENV') !== 'development') {
        // Fuera de desarrollo, simular un envío haría que el usuario crea que el correo salió.
        this.logger.error(
          `[ACS] Sin credenciales (ACS_CONNECTION_STRING / ACS_SENDER_ADDRESS): no se envió el correo a ${to}.`,
        );
        throw new ServiceUnavailableException('El servicio de correo no está configurado.');
      } else {
        this.logger.warn(
          `⚠️ [MODO DEV] Plantilla compilada correctamente. Cancelando interred (Falso Positivo) al no detectar llaves de ACS.`,
        );
      }
    } catch (error) {
      if ((error as any)?.statusCode === 429) {
        this.logger.warn(`[ACS] Rate limit alcanzado al enviar correo a ${to}. Reintenta más tarde.`);
        throw new ServiceUnavailableException('RATE_LIMIT_EXCEEDED');
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(`[ACS] Timeout (15s) al enviar correo a ${to}.`);
        throw new ServiceUnavailableException('El servicio de correo provocó un timeout. Intenta de nuevo en unos instantes.');
      }

      if (error instanceof RestError) {
        if (error.code === 'ETIMEDOUT') {
          this.logger.warn(`[ACS] Timeout al enviar correo a ${to}.`, error.stack);
          throw new ServiceUnavailableException('El servicio de correo provocó un timeout. Intenta de nuevo en unos instantes.');
        }
        this.logger.error(`Error de ACS con codigo ${error.code}`, error.stack);
        throw new ServiceUnavailableException(`Fallo en ACS: ${error.code ?? 'unknown'}`);
      }

      if (error instanceof ServiceUnavailableException || error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Error inesperado enviando correo: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error inesperado enviando correo');
    }
  }

  /**
   * Reintenta solo fallos transitorios de ACS (429, timeout, 5xx) con backoff exponencial.
   * Cada intento fallido queda en el log; el último error se propaga a sendEmail.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    to: string,
    maxAttempts = 3,
    baseDelayMs = 1_000,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const statusCode = (error as any)?.statusCode;
        const transient =
          statusCode === 429 ||
          (typeof statusCode === 'number' && statusCode >= 500) ||
          (error instanceof Error && error.name === 'AbortError') ||
          (error instanceof RestError && error.code === 'ETIMEDOUT');

        if (!transient || attempt >= maxAttempts) throw error;

        const delay = baseDelayMs * 2 ** (attempt - 1);
        this.logger.warn(
          `[ACS] Intento ${attempt}/${maxAttempts} falló para ${to} (${statusCode ?? (error as Error)?.name ?? 'unknown'}). Reintentando en ${delay} ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Helper privado para manejar errores de reenvío de forma uniforme.
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