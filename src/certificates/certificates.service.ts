import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';

@Injectable()
export class CertificatesService {
  constructor(private prisma: PrismaService) {}

  async generateCertificateHtml(
    teamId: number,
    place: number,
  ): Promise<Buffer> {
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

    const certificateHtml = await this.adjustCertificateParameters(
      template,
      teamId,
    );
    const pdfBuffer = await this.convertHtmlToPdfBase64(certificateHtml);

    return pdfBuffer;
  }

  private async adjustCertificateParameters(template: string, teamId: number) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true,
        videogame: true,
      },
    });

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    const names = team.members.map(
      (member) => member.firstName + ' ' + member.lastName,
    );
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

    const certificateHtml = template.replace(
      /{{\s*([\w.]+)\s*}}/g,
      (_, key) => {
        return replacements[key] ?? '';
      },
    );

    return certificateHtml;
  }

  private async convertHtmlToPdfBase64(htmlContent: string): Promise<Buffer> {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    const pdfBuffer = Buffer.from(pdf);
    return pdfBuffer;
  }
}
