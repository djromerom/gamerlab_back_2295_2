import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import fs from 'fs/promises';
import path from 'path';
import { ConfigService } from '@nestjs/config';
import { ActiveEdition, requireActiveEdition } from '../editions/active-edition';
import { CERT_EMAIL_CONFIG, CertEmailType } from '../email/types/cert-email.type';
import {
  assertJurorOfEdition,
  CERTIFIABLE_VIDEOGAME_STATUS,
  CERTIFICATE_TEAM_NOT_CONFIRMED,
  CERTIFICATE_TEAM_NOT_FOUND,
  CERTIFICATE_TEAM_WITHOUT_MEMBERS,
  eventDayOf,
} from './certificate-eligibility';
import {
  CERTIFICATE_TEAM_GRADABLE,
  CERTIFICATE_TEAM_NOT_GRADABLE,
} from '../teams/team-gradable';
import {
  fillCertificateTemplate,
  joinStudentNames,
} from './certificate-content';
import { ConcurrencyLimiter } from './concurrency-limiter';
import {
  EXTERNAL_PRESENTER_TEMPLATE,
  ExternalPresenterCertificateData,
  fairDateLong,
  placeWithDate,
  renderExternalPresenterCertificate,
} from './external-presenter-certificate';
import { fairNameOf } from './fair-name';
import type { CertificateDownload } from './pdf-download';

/**
 * ARK-170 (TA-19): medido contra Gotenberg, varias conversiones a la vez agotan su tiempo y
 * responde 503 (60 simultáneas: 54 fallidas); con 4 no hubo errores. Se deja margen con 3.
 */
const PDF_MAX_CONCURRENCY = 3;
const PDF_MAX_ATTEMPTS = 3;
const PDF_RETRY_BASE_MS = 1000;
/** Por encima de los 30 s que Gotenberg se da a sí mismo para cada conversión. */
const PDF_ATTEMPT_TIMEOUT_MS = 45_000;
const RETRYABLE_GOTENBERG_STATUS = new Set([429, 502, 503, 504]);

/**
 * Tamaño de página y márgenes para Gotenberg (acepta unidades: `11in`, `0mm`). Sin esto,
 * Gotenberg imprime en carta con sus márgenes por defecto e ignora el `@page` del HTML.
 */
export interface PdfPageOptions {
  paperWidth: string;
  paperHeight: string;
  margin: string;
}

const TEMPLATE_BY_PLACE: Record<number, string> = {
  1: 'certificate-First.html',
  2: 'certificate-Second.html',
  3: 'certificate-Third.html',
};
const PARTICIPATION_TEMPLATE = 'certificate-printable.html';

const CERTIFICATE_FILE_LABEL: Record<CertEmailType, string> = {
  PARTICIPATION_CERTIFICATE: 'participacion',
  '1ST_PLACE_CERTIFICATE': 'primer-puesto',
  '2ND_PLACE_CERTIFICATE': 'segundo-puesto',
  '3RD_PLACE_CERTIFICATE': 'tercer-puesto',
};

export interface CertifiableTeam {
  id: number;
  teamName: string;
  teamCode: string | null;
  gameName: string;
  memberNames: string[];
  memberEmails: string[];
  fairName: string;
  /** «26 de noviembre de 2026», o vacío si la feria no tiene fecha en el cronograma (HU-12). */
  eventDate: string;
}

/** Fallo de Gotenberg que vale la pena reintentar (saturación o red). */
class RetryablePdfError extends Error {}

@Injectable()
export class CertificatesService {
  private readonly pdfLimiter = new ConcurrencyLimiter(PDF_MAX_CONCURRENCY);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  // ─────────────────────────────────────────────
  // TEAM CERTIFICATES
  // ─────────────────────────────────────────────

  /**
   * ARK-170 (TA-19, BG-22, BG-40): solo se certifica un equipo activo de la edición activa con el
   * videojuego confirmado, y solo figuran sus integrantes activos.
   * HU-39 (ARK-209): `kind` separa los dos certificados. El de participación y los de podio
   * (`graded`) no se dan a un equipo no calificable; el de presentador externo (`presenter`) solo
   * se da a uno no calificable.
   */
  async findCertifiableTeam(
    where: { id: number } | { userId: string },
    kind: 'graded' | 'presenter' = 'graded',
  ): Promise<CertifiableTeam> {
    const edition = await requireActiveEdition(this.prisma);
    const team = await this.prisma.team.findFirst({
      where: { ...where, editionId: edition.id, isActive: true },
      orderBy: { id: 'desc' },
      include: {
        members: { where: { isActive: true }, orderBy: { id: 'asc' } },
        videogame: { include: { videogameStatus: true } },
      },
    });

    if (!team) {
      throw new NotFoundException({
        statusCode: 404,
        code: CERTIFICATE_TEAM_NOT_FOUND,
        message: `No hay un equipo activo en «${edition.title}» para este certificado.`,
      });
    }
    if (
      !team.videogame?.isActive ||
      team.videogame.videogameStatus?.status !== CERTIFIABLE_VIDEOGAME_STATUS
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: CERTIFICATE_TEAM_NOT_CONFIRMED,
        message: `El equipo «${team.teamName}» no tiene la inscripción confirmada: no se le puede generar el certificado.`,
      });
    }
    if (kind === 'graded' && team.notGradable) {
      throw new BadRequestException({
        statusCode: 400,
        code: CERTIFICATE_TEAM_NOT_GRADABLE,
        message: `El equipo «${team.teamName}» es un presentador externo: recibe el certificado de presentador externo, no el de participación.`,
      });
    }
    if (kind === 'presenter' && !team.notGradable) {
      throw new BadRequestException({
        statusCode: 400,
        code: CERTIFICATE_TEAM_GRADABLE,
        message: `El equipo «${team.teamName}» no está marcado como presentador externo (no calificable).`,
      });
    }
    if (team.members.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: CERTIFICATE_TEAM_WITHOUT_MEMBERS,
        message: `El equipo «${team.teamName}» no tiene integrantes activos.`,
      });
    }

    return {
      id: team.id,
      teamName: team.teamName,
      teamCode: team.teamCode,
      gameName: team.videogame.name,
      memberNames: team.members.map((m) => `${m.firstName} ${m.lastName}`),
      memberEmails: team.members.map((m) => m.email),
      fairName: fairNameOf(edition),
      eventDate: await this.eventDateOf(edition),
    };
  }

  async generateTeamCertificatePdf(
    team: CertifiableTeam,
    place: number,
  ): Promise<Buffer> {
    const template = await this.readTemplate(
      TEMPLATE_BY_PLACE[place] ?? PARTICIPATION_TEMPLATE,
    );
    return this.convertHtmlToPdf(
      fillCertificateTemplate(template, {
        teamName: team.teamName,
        gameName: team.gameName,
        studentList: joinStudentNames(team.memberNames),
        fairName: team.fairName,
        // ARK-256: «del 26 de noviembre de 2026», o vacío (sin «del» suelto) sin fecha de feria
        eventDate: team.eventDate ? `del ${team.eventDate}` : '',
        placeAndDate: placeWithDate(team.eventDate),
      }),
    );
  }

  /** Descarga individual para el administrador: las mismas reglas que el envío por correo. */
  async downloadTeamCertificate(
    teamId: number,
    type: CertEmailType,
  ): Promise<CertificateDownload> {
    const team = await this.findCertifiableTeam({ id: teamId });
    const pdf = await this.generateTeamCertificatePdf(
      team,
      CERT_EMAIL_CONFIG[type].certIndex,
    );
    return {
      pdf,
      fileName: `certificado-${CERTIFICATE_FILE_LABEL[type]}-${team.teamCode ?? team.teamName}.pdf`,
    };
  }

  // ─────────────────────────────────────────────
  // JUROR CERTIFICATES
  // Los jurados son Users en la DB — no existe modelo Juror separado.
  // ─────────────────────────────────────────────

  async generateJurorCertificateHtml(userId: string): Promise<Buffer> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('Juror (user) not found');
    }

    const edition = await requireActiveEdition(this.prisma);
    const eventDate = await this.eventDateOf(edition);
    const template = await this.readTemplate('certificate-juror.html');
    return this.convertHtmlToPdf(
      fillCertificateTemplate(template, {
        jurorName: `${user.firstName} ${user.lastName}`,
        jurorTitle: '', // No hay campo título en User
        fairName: fairNameOf(edition),
        placeAndDate: placeWithDate(eventDate),
      }),
    );
  }

  /** Descarga individual para el administrador: solo jurados de la edición activa. */
  async downloadJurorCertificate(userId: string): Promise<CertificateDownload> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User (juror) with id ${userId} not found`);
    }
    const jurorName = `${user.firstName} ${user.lastName}`;
    const edition = await requireActiveEdition(this.prisma);
    await assertJurorOfEdition(this.prisma, edition, userId, jurorName);
    return {
      pdf: await this.generateJurorCertificateHtml(userId),
      fileName: `certificado-jurado-${jurorName}.pdf`,
    };
  }

  // ─────────────────────────────────────────────
  // EXTERNAL PRESENTER CERTIFICATE (HU-33)
  // ─────────────────────────────────────────────

  async generateExternalPresenterCertificatePdf(
    data: ExternalPresenterCertificateData,
  ): Promise<Buffer> {
    const template = await this.readTemplate(EXTERNAL_PRESENTER_TEMPLATE);
    return this.convertHtmlToPdf(renderExternalPresenterCertificate(template, data));
  }

  // ─────────────────────────────────────────────
  // SHARED
  // ─────────────────────────────────────────────

  private async eventDateOf(edition: ActiveEdition): Promise<string> {
    const day = await eventDayOf(this.prisma, edition);
    return day ? fairDateLong(day) : '';
  }

  private readTemplate(name: string): Promise<string> {
    return fs.readFile(path.join(__dirname, '.', 'assets', name), 'utf8');
  }

  /** ARK-170 (TA-19): un lote no puede saturar Gotenberg, venga de donde venga. */
  convertHtmlToPdf(
    htmlContent: string,
    page?: PdfPageOptions,
  ): Promise<Buffer> {
    return this.pdfLimiter.run(() =>
      this.requestPdfWithRetry(htmlContent, page),
    );
  }

  private async requestPdfWithRetry(
    htmlContent: string,
    page?: PdfPageOptions,
  ): Promise<Buffer> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.requestPdf(htmlContent, page);
      } catch (error) {
        if (!(error instanceof RetryablePdfError)) throw error;
        if (attempt >= PDF_MAX_ATTEMPTS) {
          throw new InternalServerErrorException(
            `Gotenberg PDF generation failed: ${error.message}`,
          );
        }
        await this.wait(PDF_RETRY_BASE_MS * attempt);
      }
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async requestPdf(
    htmlContent: string,
    page?: PdfPageOptions,
  ): Promise<Buffer> {
    const gotenbergUrl = this.configService.get<string>('GOTENBERG_URL');

    if (!gotenbergUrl) {
      throw new InternalServerErrorException('GOTENBERG_URL not configured');
    }

    const formData = new FormData();
    formData.append(
      'files',
      new Blob([htmlContent], { type: 'text/html' }),
      'index.html',
    );
    // Gotenberg espera a que la red quede inactiva (imágenes y fuentes). Una espera fija adicional
    // de 4 s no cambiaba el PDF y triplicaba el tiempo de cada uno.
    formData.append('skipNetworkIdleEvent', 'false');
    if (page) {
      formData.append('paperWidth', page.paperWidth);
      formData.append('paperHeight', page.paperHeight);
      for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
        formData.append(`margin${side}`, page.margin);
      }
    }

    let response: Response;
    try {
      response = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(PDF_ATTEMPT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RetryablePdfError(
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      const detail = `${response.status} ${response.statusText}`;
      if (RETRYABLE_GOTENBERG_STATUS.has(response.status)) {
        throw new RetryablePdfError(detail);
      }
      throw new InternalServerErrorException(
        `Gotenberg PDF generation failed: ${detail}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
