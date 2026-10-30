import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus, JurorCategory, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { toDataURL } from 'qrcode';
import { CertificatesService } from '../certificates/certificates.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildBadgesHtml } from './badge-template';

const JUROR_ROLE_NAME = 'Jurado';
const PROFESSOR_ROLE_NAME = 'Profesor';

const jurorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  jurorCategory: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

type BadgeJuror = Prisma.UserGetPayload<{ select: typeof jurorSelect }>;

export interface SkippedBadge {
  jurorId: string;
  /** Null cuando el id no corresponde a un jurado o profesor activo. */
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
    const edition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true, title: true },
    });
    if (!edition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }
    return edition;
  }

  private eligibleJurors(ids?: string[]): Prisma.UserWhereInput {
    return {
      isActive: true,
      role: { name: { in: [JUROR_ROLE_NAME, PROFESSOR_ROLE_NAME] } },
      ...(ids ? { id: { in: ids } } : {}),
    };
  }

  /** Todo profesor cuenta como senior (P-07); el resto usa su categoría. */
  private categoryLabel(juror: BadgeJuror): string {
    const category =
      juror.jurorCategory ??
      (juror.role.name === PROFESSOR_ROLE_NAME ? JurorCategory.SENIOR : null);
    if (category === JurorCategory.SENIOR) return 'Senior';
    if (category === JurorCategory.JUNIOR) return 'Junior';
    return 'Sin categoría';
  }

  private fullName(juror: BadgeJuror): string {
    return `${juror.firstName ?? ''} ${juror.lastName ?? ''}`.trim();
  }

  private missingData(juror: BadgeJuror): string | null {
    if (!juror.firstName?.trim() || !juror.lastName?.trim()) {
      return 'Falta el nombre o el apellido del jurado';
    }
    return null;
  }

  /**
   * Crea la escarapela activa de cada jurado que aún no la tiene en la edición activa.
   * Es idempotente: repetirla no cambia los tokens existentes.
   */
  async generate(jurorIds?: string[]) {
    const edition = await this.getActiveEdition();

    const jurors = await this.prisma.user.findMany({
      where: this.eligibleJurors(jurorIds),
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
            reason: 'No es un jurado o profesor activo',
          });
        }
      }
    }

    const valid: BadgeJuror[] = [];
    for (const juror of jurors) {
      const problem = this.missingData(juror);
      if (problem) {
        skipped.push({
          jurorId: juror.id,
          name: this.fullName(juror) || null,
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

  private async findBadges(editionId: number, jurorIds?: string[]) {
    const badges = await this.prisma.jurorBadge.findMany({
      where: {
        editionId,
        isActive: true,
        juror: { isActive: true },
        ...(jurorIds ? { jurorId: { in: jurorIds } } : {}),
      },
      include: { juror: { select: jurorSelect } },
    });
    return badges.sort((a, b) =>
      this.fullName(a.juror).localeCompare(this.fullName(b.juror), 'es'),
    );
  }

  async list() {
    const edition = await this.getActiveEdition();
    const badges = await this.findBadges(edition.id);
    return {
      editionId: edition.id,
      data: badges.map((b) => ({
        jurorId: b.jurorId,
        name: this.fullName(b.juror),
        category: this.categoryLabel(b.juror),
        token: b.token,
      })),
    };
  }

  /** Invalida la escarapela activa del jurado (pérdida o error) y crea una nueva. */
  async regenerate(jurorId: string) {
    const edition = await this.getActiveEdition();

    const juror = await this.prisma.user.findFirst({
      where: this.eligibleJurors([jurorId]),
      select: jurorSelect,
    });
    if (!juror) {
      throw new NotFoundException('Jurado no encontrado o inactivo');
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
        name: this.fullName(b.juror),
        category: this.categoryLabel(b.juror),
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
   * Resuelve un token escaneado. Solo es válido si la escarapela está activa y
   * pertenece a la edición activa. Lo usará el check-in (HU-11).
   */
  async validateToken(token: string) {
    const badge = await this.prisma.jurorBadge.findFirst({
      where: {
        token,
        isActive: true,
        edition: { status: EditionStatus.ACTIVE },
        juror: { isActive: true },
      },
      include: { juror: { select: jurorSelect } },
    });
    if (!badge) {
      throw new NotFoundException('Código QR no válido o de otra edición');
    }
    return {
      badgeId: badge.id,
      jurorId: badge.jurorId,
      editionId: badge.editionId,
      name: this.fullName(badge.juror),
      category: this.categoryLabel(badge.juror),
    };
  }
}
