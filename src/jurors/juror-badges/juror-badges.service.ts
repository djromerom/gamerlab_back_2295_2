import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { toDataURL } from 'qrcode';
import { CertificatesService } from 'src/certificates/certificates.service';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { buildBadgesHtml } from './badge-template';
import {
  LabeledJuror,
  jurorCategoryLabel,
  jurorFullName,
  jurorSelect,
} from './juror-label';
import { findActiveEdition } from 'src/editions/active-edition';

export interface SkippedBadge {
  jurorId: string;
  /** Null cuando el id no corresponde a un jurado de la edición activa (BG-16). */
  name: string | null;
  reason: string;
}

@Injectable()
export class JurorBadgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificatesService,
  ) {}

  /** Genera el token opaco del QR: no contiene ni se deriva de datos personales. */
  private newToken(): string {
    return randomBytes(16).toString('base64url');
  }

  private async getActiveEdition() {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }
    return edition;
  }

  private missingData(juror: LabeledJuror): string | null {
    if (!juror.firstName?.trim() || !juror.lastName?.trim()) {
      return 'Falta el nombre o el apellido del jurado';
    }
    return null;
  }

  /**
   * Crea la escarapela activa de cada jurado de la edición activa (`jurorsOfEdition`) que aún
   * no la tiene. Es idempotente: repetirla no cambia los tokens existentes.
   */
  async generate(jurorIds?: string[]) {
    const edition = await this.getActiveEdition();

    const jurors = await this.prisma.user.findMany({
      where: jurorsOfEdition(edition.id, jurorIds),
      select: jurorSelect,
    });

    const skipped: SkippedBadge[] = [];
    if (jurorIds) {
      const found = new Set(jurors.map((j) => j.id));
      for (const id of jurorIds) {
        if (!found.has(id)) {
          skipped.push({
            jurorId: id,
            name: null,
            reason: 'No es jurado de la edición activa',
          });
        }
      }
    }

    const valid: LabeledJuror[] = [];
    for (const juror of jurors) {
      const problem = this.missingData(juror);
      if (problem) {
        skipped.push({
          jurorId: juror.id,
          name: jurorFullName(juror) || null,
          reason: problem,
        });
      } else valid.push(juror);
    }

    const existingBadges = await this.prisma.jurorBadge.findMany({
      where: {
        editionId: edition.id,
        isActive: true,
        jurorId: { in: valid.map((j) => j.id) },
      },
      select: { jurorId: true },
    });
    const withBadge = new Set(existingBadges.map((b) => b.jurorId));
    const toCreate = valid.filter((j) => !withBadge.has(j.id));

    // skipDuplicates cubre una carrera con el índice único parcial (jurado, edición).
    const result = await this.prisma.jurorBadge.createMany({
      data: toCreate.map((j) => ({
        jurorId: j.id,
        editionId: edition.id,
        token: this.newToken(),
      })),
      skipDuplicates: true,
    });

    return {
      editionId: edition.id,
      created: result.count,
      existing: valid.length - result.count,
      skipped,
    };
  }

  /** BG-16: solo escarapelas de jurados de la edición, aunque haya quedado alguna vieja activa. */
  private async findBadges(editionId: number, jurorIds?: string[]) {
    const badges = await this.prisma.jurorBadge.findMany({
      where: {
        editionId,
        isActive: true,
        juror: jurorsOfEdition(editionId),
        ...(jurorIds ? { jurorId: { in: jurorIds } } : {}),
      },
      include: { juror: { select: jurorSelect } },
    });
    return badges.sort((a, b) =>
      jurorFullName(a.juror).localeCompare(jurorFullName(b.juror), 'es'),
    );
  }

  async list() {
    const edition = await this.getActiveEdition();
    const badges = await this.findBadges(edition.id);
    return {
      editionId: edition.id,
      data: badges.map((b) => ({
        jurorId: b.jurorId,
        name: jurorFullName(b.juror),
        category: jurorCategoryLabel(b.juror),
        token: b.token,
      })),
    };
  }

  /** Invalida la escarapela activa del jurado (pérdida o error) y crea una nueva. */
  async regenerate(jurorId: string) {
    const edition = await this.getActiveEdition();

    const juror = await this.prisma.user.findFirst({
      where: jurorsOfEdition(edition.id, [jurorId]),
      select: jurorSelect,
    });
    if (!juror) {
      throw new NotFoundException('No es jurado de la edición activa');
    }
    const problem = this.missingData(juror);
    if (problem) throw new BadRequestException(problem);

    const token = this.newToken();
    await this.prisma.$transaction([
      this.prisma.jurorBadge.updateMany({
        where: { jurorId, editionId: edition.id, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.jurorBadge.create({
        data: { jurorId, editionId: edition.id, token },
      }),
    ]);

    return { jurorId, editionId: edition.id, token };
  }

  /** PDF imprimible con las escarapelas (QR generado con el token). */
  async generatePdf(jurorIds?: string[]): Promise<Buffer> {
    const edition = await this.getActiveEdition();
    const badges = await this.findBadges(edition.id, jurorIds);
    if (badges.length === 0) {
      throw new NotFoundException(
        'No hay escarapelas para generar. Genera las escarapelas primero.',
      );
    }

    const cards = await Promise.all(
      badges.map(async (b) => ({
        name: jurorFullName(b.juror),
        qrDataUri: await toDataURL(b.token, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 300,
        }),
      })),
    );

    return this.certificates.convertHtmlToPdf(
      buildBadgesHtml(cards, edition.title),
    );
  }

  /**
   * Resuelve un token escaneado (check-in, HU-11). Solo es válido si la escarapela está
   * activa, es de la edición activa y su dueño es jurado de esa edición (BG-16).
   */
  async validateToken(token: string) {
    const edition = await findActiveEdition(this.prisma);
    const badge = edition
      ? await this.prisma.jurorBadge.findFirst({
          where: {
            token,
            isActive: true,
            editionId: edition.id,
            juror: jurorsOfEdition(edition.id),
          },
          include: { juror: { select: jurorSelect } },
        })
      : null;
    if (!badge) {
      throw new NotFoundException('Código QR no válido o de otra edición');
    }
    return {
      badgeId: badge.id,
      jurorId: badge.jurorId,
      editionId: badge.editionId,
      name: jurorFullName(badge.juror),
      category: jurorCategoryLabel(badge.juror),
    };
  }
}
