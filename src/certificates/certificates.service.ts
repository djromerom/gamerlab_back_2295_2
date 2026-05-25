import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import fs from 'fs/promises';
import path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CertificatesService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  // ─────────────────────────────────────────────
  // TEAM CERTIFICATES
  // ─────────────────────────────────────────────

  async generateCertificateHtml(teamId: number, place: number): Promise<Buffer> {
    let templateName: string;
    switch (place) {
      case 1:
        templateName = 'certificate-First.html';
        break;
      case 2:
        templateName = 'certificate-Second.html';
        break;
      case 3:
        templateName = 'certificate-Third.html';
        break;
      default:
        templateName = 'certificate-printable.html'; // Participation certificate
        break;
    }

    const templatePath = path.join(__dirname, '.', 'assets', templateName);
    let template = await fs.readFile(templatePath, 'utf8');

    const certificateHtml = await this.adjustCertificateParameters(template, teamId);
    const pdfBuffer = await this.convertHtmlToPdf(certificateHtml);

    return pdfBuffer;
  }

  private async adjustCertificateParameters(template: string, teamId: number) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true,
        videogame: true
      },
    });

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    const names = team.members.map(member => member.firstName + ' ' + member.lastName);
    const namesString =
      names.length > 1
        ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1]
        : names[0];
    const teamName = team.teamName;
    const videogameName = team.videogame?.name || 'N/A';

    const replacements: Record<string, string> = {
      teamName,
      gameName: videogameName,
      studentList: namesString,
    };

    const certificateHtml = template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
      return replacements[key] ?? '';
    });

    return certificateHtml;
  }

  // ─────────────────────────────────────────────
  // JUROR CERTIFICATES
  // Los jurados son Users en la DB — no existe modelo Juror separado.
  // ─────────────────────────────────────────────

  async generateJurorCertificateHtml(userId: string): Promise<Buffer> {
    const templatePath = path.join(__dirname, '.', 'assets', 'certificate-juror.html');
    const template = await fs.readFile(templatePath, 'utf8');

    const certificateHtml = await this.adjustJurorCertificateParameters(template, userId);
    const pdfBuffer = await this.convertHtmlToPdf(certificateHtml);

    return pdfBuffer;
  }

  private async adjustJurorCertificateParameters(template: string, userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Juror (user) not found');
    }

    const jurorName = `${user.firstName} ${user.lastName}`;

    const replacements: Record<string, string> = {
      jurorName,
      jurorTitle: '', // No hay campo título en User; puedes quitarlo del HTML si no lo necesitas
    };

    const certificateHtml = template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
      return replacements[key] ?? '';
    });

    return certificateHtml;
  }

  // ─────────────────────────────────────────────
  // SHARED
  // ─────────────────────────────────────────────

  private async convertHtmlToPdf(htmlContent: string): Promise<Buffer> {
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

    let response: Response;
    try {
      response = await fetch(
        `${gotenbergUrl}/forms/chromium/convert/html`,
        { method: 'POST', body: formData },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `Gotenberg PDF generation failed: ${message}`
      );
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Gotenberg PDF generation failed: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}