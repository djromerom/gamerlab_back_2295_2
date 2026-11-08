import { Injectable, Logger } from '@nestjs/common';
import { CertificatesService } from '../certificates/certificates.service';
import { placeAndDateOf } from '../certificates/external-presenter-certificate';
import { requireActiveEdition } from '../editions/active-edition';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExternalPresentersService,
  PresenterRow,
} from './external-presenters.service';

/**
 * HU-33 (ARK-194): certificado de asistencia del presentador externo. Como el de los jurados,
 * lo envía el administrador por correo con el PDF adjunto; el presentador no lo descarga desde
 * su cuenta. La fecha sale del cronograma de la feria (HU-12) si está configurado.
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
    const sentAt = await this.send(row, await this.placeAndDate(row.editionId));
    return { id, email: row.user.email, certificateSentAt: sentAt };
  }

  /** Todos los de la edición activa, uno por uno: un fallo no detiene a los demás. */
  async sendAll() {
    const edition = await requireActiveEdition(this.prisma);
    const rows = await this.presenters.rowsOf(edition.id);
    const placeAndDate = await this.placeAndDate(edition.id);
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
    return {
      sent,
      failed,
      message:
        rows.length === 0
          ? `No hay presentadores externos en «${edition.title}».`
          : `Certificados enviados: ${sent} de ${rows.length}.`,
    };
  }

  private async send(row: PresenterRow, placeAndDate: string): Promise<Date> {
    const presenterName = `${row.user.firstName} ${row.user.lastName}`.trim();
    const pdf = await this.certificates.generateExternalPresenterCertificatePdf(
      {
        presenterName,
        organization: row.organization,
        presentationTitle: row.presentationTitle,
        editionTitle: row.edition.title,
        placeAndDate,
      },
    );
    await this.email.sendEmail(
      row.user.email,
      `Tu certificado de asistencia — ${row.edition.title}`,
      'external_presenter_certificate',
      { presenterName, editionTitle: row.edition.title, placeAndDate },
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

  private async placeAndDate(editionId: number): Promise<string> {
    const schedule = await this.prisma.fairSchedule.findUnique({
      where: { editionId },
      select: { fairDate: true },
    });
    return placeAndDateOf(schedule?.fairDate ?? null);
  }
}
