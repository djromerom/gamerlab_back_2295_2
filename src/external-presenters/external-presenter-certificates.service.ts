import { Injectable, Logger } from '@nestjs/common';
import { CertificatesService } from '../certificates/certificates.service';
import type { CertificateDownload } from '../certificates/pdf-download';
import { eventDayOf } from '../certificates/certificate-eligibility';
import { placeAndDateOf } from '../certificates/external-presenter-certificate';
import { joinStudentNames } from '../certificates/certificate-content';
import type { CertifiableTeam } from '../certificates/certificates.service';
import { fairNameOf } from '../certificates/fair-name';
import { requireActiveEdition } from '../editions/active-edition';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExternalPresentersService,
  PresenterRow,
} from './external-presenters.service';
import { presenterTeamsOf } from './external-presenter-teams';

/**
 * HU-33 (ARK-194): certificado de asistencia del presentador externo. Como el de los jurados,
 * lo envía el administrador por correo con el PDF adjunto o lo descarga (ARK-170); el presentador
 * no lo descarga desde su cuenta. La fecha sale del cronograma de la feria (HU-12) si está
 * configurado.
 */
@Injectable()
export class ExternalPresenterCertificatesService {
  private readonly logger = new Logger(
    ExternalPresenterCertificatesService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenters: ExternalPresentersService,
    private readonly certificates: CertificatesService,
    private readonly email: EmailService,
  ) {}

  /** Uno: solo de la edición activa. */
  async sendOne(id: number) {
    const row = await this.presenters.findWritable(id);
    const sentAt = await this.send(row, await this.placeAndDate(row.edition));
    return { id, email: row.user.email, certificateSentAt: sentAt };
  }

  /** ARK-170 (TA-19): descarga para el administrador; no cuenta como enviado. */
  async download(id: number): Promise<CertificateDownload> {
    const row = await this.presenters.findWritable(id);
    const pdf = await this.buildPdf(row, await this.placeAndDate(row.edition));
    return { pdf, fileName: `certificado-presentador-${this.nameOf(row)}.pdf` };
  }

  /**
   * Todos los de la edición activa, uno por uno: un fallo no detiene a los demás. Incluye a los
   * equipos presentadores (HU-39, ARK-209), que se informan aparte en `teams`.
   */
  async sendAll() {
    const edition = await requireActiveEdition(this.prisma);
    const rows = await this.presenters.rowsOf(edition.id);
    const placeAndDate = await this.placeAndDate(edition);
    const failed: { id: number; email: string; error: string }[] = [];
    let sent = 0;
    for (const row of rows) {
      try {
        await this.send(row, placeAndDate);
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Certificado del presentador ${row.id}: ${message}`);
        failed.push({ id: row.id, email: row.user.email, error: message });
      }
    }

    const teamIds = (await presenterTeamsOf(this.prisma, edition.id)).map((t) => t.id);
    const teamsFailed: { teamId: number; error: string }[] = [];
    let teamsSent = 0;
    for (const teamId of teamIds) {
      try {
        await this.sendTeam(teamId);
        teamsSent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Certificado del equipo presentador ${teamId}: ${message}`);
        teamsFailed.push({ teamId, error: message });
      }
    }

    const total = rows.length + teamIds.length;
    return {
      sent,
      failed,
      teams: { sent: teamsSent, failed: teamsFailed },
      message:
        total === 0
          ? `No hay presentadores externos en «${edition.title}».`
          : `Certificados enviados: ${sent} de ${rows.length} presentadores y ${teamsSent} de ${teamIds.length} equipos.`,
    };
  }

  /**
   * HU-39 (ARK-209): certificado de presentador externo de un equipo no calificable. Es uno por
   * equipo (los integrantes activos y el título del proyecto, como el de participación) y le llega
   * por correo a cada integrante activo. Si falla un correo, se informa en `failed`.
   */
  async sendTeam(teamId: number) {
    const team = await this.certificates.findCertifiableTeam({ id: teamId }, 'presenter');
    const edition = await requireActiveEdition(this.prisma);
    const placeAndDate = await this.placeAndDate(edition);
    const pdf = await this.buildTeamPdf(team, placeAndDate);
    const attachment = {
      name: 'certificado-presentador-externo.pdf',
      contentType: 'application/pdf',
      contentInBase64: pdf.toString('base64'),
    };
    const sentTo: string[] = [];
    const failed: { email: string; error: string }[] = [];
    for (const [index, email] of team.memberEmails.entries()) {
      try {
        await this.email.sendEmail(
          email,
          `Tu certificado de asistencia — ${team.fairName}`,
          'external_presenter_certificate',
          {
            presenterName: team.memberNames[index],
            editionTitle: team.fairName,
            placeAndDate,
          },
          [attachment],
        );
        sentTo.push(email);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Certificado del equipo presentador ${teamId}: ${message}`);
        failed.push({ email, error: message });
      }
    }
    if (sentTo.length === 0) {
      throw new Error(`No se pudo enviar el certificado del equipo «${team.teamName}» a ningún integrante.`);
    }
    return { teamId, sentTo, failed };
  }

  /** HU-39 (ARK-209): descarga del certificado de un equipo presentador; no envía correos. */
  async downloadTeam(teamId: number): Promise<CertificateDownload> {
    const team = await this.certificates.findCertifiableTeam({ id: teamId }, 'presenter');
    const edition = await requireActiveEdition(this.prisma);
    const pdf = await this.buildTeamPdf(team, await this.placeAndDate(edition));
    return {
      pdf,
      fileName: `certificado-presentador-${team.teamCode ?? team.teamName}.pdf`,
    };
  }

  private buildTeamPdf(team: CertifiableTeam, placeAndDate: string): Promise<Buffer> {
    return this.certificates.generateExternalPresenterCertificatePdf({
      presenterName: joinStudentNames(team.memberNames),
      organization: `Equipo ${team.teamName}`,
      presentationTitle: team.gameName,
      editionTitle: team.fairName,
      placeAndDate,
    });
  }

  private async send(row: PresenterRow, placeAndDate: string): Promise<Date> {
    const presenterName = this.nameOf(row);
    const pdf = await this.buildPdf(row, placeAndDate);
    await this.email.sendEmail(
      row.user.email,
      `Tu certificado de asistencia — ${fairNameOf(row.edition)}`,
      'external_presenter_certificate',
      { presenterName, editionTitle: fairNameOf(row.edition), placeAndDate },
      [
        {
          name: 'certificado-presentador-externo.pdf',
          contentType: 'application/pdf',
          contentInBase64: pdf.toString('base64'),
        },
      ],
    );
    const sentAt = new Date();
    await this.prisma.externalPresenter.update({
      where: { id: row.id },
      data: { certificateSentAt: sentAt },
    });
    return sentAt;
  }

  private nameOf(row: PresenterRow): string {
    return `${row.user.firstName} ${row.user.lastName}`.trim();
  }

  private buildPdf(row: PresenterRow, placeAndDate: string): Promise<Buffer> {
    return this.certificates.generateExternalPresenterCertificatePdf({
      presenterName: this.nameOf(row),
      organization: row.organization,
      presentationTitle: row.presentationTitle,
      editionTitle: fairNameOf(row.edition),
      placeAndDate,
    });
  }

  private async placeAndDate(edition: {
    id: number;
    startsAt: Date;
  }): Promise<string> {
    return placeAndDateOf(await eventDayOf(this.prisma, edition));
  }
}
