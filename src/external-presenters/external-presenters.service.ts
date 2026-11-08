import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus, Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import {
  findUsersByEmailCaseInsensitive,
  normalizeEmail,
} from '../common/utils/find-user-by-email';
import {
  findActiveEdition,
  requireActiveEdition,
} from '../editions/active-edition';
import { resolveListEdition } from '../editions/list-edition';
import { resolveEdition } from '../juror-edition/edition-resolver';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExternalPresenterDto,
  UpdateExternalPresenterDto,
} from './dto/external-presenter.dto';

export const EXTERNAL_PRESENTER_ROLE_NAME = 'Presentador externo';

export const EMAIL_CONFIRMATION_MISMATCH = 'EMAIL_CONFIRMATION_MISMATCH';
export const EMAIL_IN_USE_BY_OTHER_ROLE = 'EMAIL_IN_USE_BY_OTHER_ROLE';
export const EXTERNAL_PRESENTER_ALREADY_REGISTERED =
  'EXTERNAL_PRESENTER_ALREADY_REGISTERED';
export const EXTERNAL_PRESENTER_NOT_FOUND = 'EXTERNAL_PRESENTER_NOT_FOUND';
export const EXTERNAL_PRESENTER_READ_ONLY = 'EXTERNAL_PRESENTER_READ_ONLY';

export const presenterInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      lastSignInAt: true,
    },
  },
  edition: { select: { id: true, title: true, status: true } },
} satisfies Prisma.ExternalPresenterInclude;

export type PresenterRow = Prisma.ExternalPresenterGetPayload<{
  include: typeof presenterInclude;
}>;

/** Lo que reciben el administrador y el Excel por cada presentador. */
export interface ExternalPresenterView {
  id: number;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  organization: string | null;
  presentationTitle: string | null;
  editionId: number;
  /** null = todavía no ha entrado a ARKAD (no completó la cuenta). */
  lastSignInAt: Date | null;
  certificateSentAt: Date | null;
  createdAt: Date;
}

export function toPresenterView(row: PresenterRow): ExternalPresenterView {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    organization: row.organization,
    presentationTitle: row.presentationTitle,
    editionId: row.editionId,
    lastSignInAt: row.user.lastSignInAt,
    certificateSentAt: row.certificateSentAt,
    createdAt: row.createdAt,
  };
}

/**
 * HU-33 (ARK-194): presentadores externos de la edición.
 *
 * - Solo el administrador los registra (no hay auto-registro): cuenta con el rol «Presentador
 *   externo» y una fila en `presentador_edicion` por edición. La persona completa la cuenta con el
 *   enlace del correo de verificación (o con Microsoft si es de Uninorte), como Staff (HU-11).
 * - No se califican: no tienen equipo y su rol no es Jurado ni Profesor, así que no entran en
 *   `jurorsOfEdition`, la asignación, el ranking, el seguimiento ni las exportaciones de notas.
 * - Se registran y se modifican solo en la edición activa; las anteriores son de solo lectura.
 */
@Injectable()
export class ExternalPresentersService {
  private readonly logger = new Logger(ExternalPresentersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(
    dto: CreateExternalPresenterDto,
    adminId: string,
  ): Promise<ExternalPresenterView> {
    if (normalizeEmail(dto.email) !== normalizeEmail(dto.confirmEmail)) {
      throw new BadRequestException({
        statusCode: 400,
        code: EMAIL_CONFIRMATION_MISMATCH,
        message: 'Los correos no coinciden.',
      });
    }
    const edition = await requireActiveEdition(this.prisma);
    const roleId = await this.presenterRoleId();
    const data = {
      organization: dto.organization ?? null,
      presentationTitle: dto.presentationTitle ?? null,
      updatedById: adminId,
    };

    const existing = await findUsersByEmailCaseInsensitive(
      this.prisma,
      dto.email,
      {
        role: { select: { name: true } },
      },
    );
    if (existing.length > 0) {
      const [user] = existing;
      if (user.roleId !== roleId) {
        throw new ConflictException({
          statusCode: 409,
          code: EMAIL_IN_USE_BY_OTHER_ROLE,
          message: `Ya existe una cuenta con ese correo con el rol «${user.role.name}». Usa otro correo.`,
        });
      }
      return this.registerExistingAccount(user.id, edition.id, dto, data);
    }

    // Cuenta nueva: registro, rol y fila de la edición en una sola transacción.
    const { row, verificationToken } = await this.prisma
      .$transaction(async (tx) => {
        const { user, verificationToken } =
          await this.auth.registerUserTransaction({ email: dto.email }, tx);
        await tx.user.update({
          where: { id: user.id },
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            roleId,
            isActive: true,
            lastSignInAt: null,
          },
        });
        const row = await tx.externalPresenter.create({
          data: { userId: user.id, editionId: edition.id, ...data },
          include: presenterInclude,
        });
        return { row, verificationToken };
      })
      .catch((error: unknown) => {
        if (error instanceof ConflictException) throw this.alreadyRegistered();
        throw error;
      });

    this.auth
      .sendVerificationEmail(row.user.email, verificationToken)
      .catch((err: unknown) =>
        this.logger.error(
          `No se pudo enviar el correo de verificación al presentador ${row.userId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    return toPresenterView(row);
  }

  /** Varios a la vez: cada fila se procesa sola; las que fallan se informan con su motivo. */
  async createMany(dtos: CreateExternalPresenterDto[], adminId: string) {
    const successful: ExternalPresenterView[] = [];
    const failed: { email: string; code: string; message: string }[] = [];
    const seen = new Set<string>();
    for (const dto of dtos) {
      const email = normalizeEmail(dto.email);
      if (seen.has(email)) {
        failed.push({
          email,
          code: 'DUPLICATED_IN_BATCH',
          message: 'El correo está repetido en la lista.',
        });
        continue;
      }
      seen.add(email);
      try {
        successful.push(await this.create(dto, adminId));
      } catch (error) {
        const response =
          error instanceof BadRequestException ||
          error instanceof ConflictException ||
          error instanceof NotFoundException
            ? (error.getResponse() as {
                code?: string;
                message?: string | string[];
              })
            : null;
        if (!response) throw error;
        failed.push({
          email,
          code: response.code ?? 'INVALID',
          message: Array.isArray(response.message)
            ? response.message.join(' ')
            : (response.message ?? 'No se pudo registrar.'),
        });
      }
    }
    return {
      successful,
      failed,
      message: `Procesados ${dtos.length}: ${successful.length} registrados, ${failed.length} con error.`,
    };
  }

  /** La edición pedida o la activa; sin edición activa, lista vacía. */
  async list(editionId?: number) {
    const edition = await resolveListEdition(this.prisma, editionId);
    if (!edition)
      return { edition: null, presenters: [] as ExternalPresenterView[] };
    const rows = await this.rowsOf(edition.id);
    return { edition, presenters: rows.map(toPresenterView) };
  }

  /** Para el Excel: la edición pedida o la activa (404 si no existe) con sus presentadores. */
  async exportData(editionId?: number) {
    const edition = await resolveEdition(this.prisma, editionId);
    const rows = await this.rowsOf(edition.id);
    return { edition, presenters: rows.map(toPresenterView) };
  }

  async rowsOf(editionId: number): Promise<PresenterRow[]> {
    return this.prisma.externalPresenter.findMany({
      where: { editionId, isActive: true, user: { isActive: true } },
      include: presenterInclude,
      orderBy: [
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } },
        { id: 'asc' },
      ],
    });
  }

  async update(id: number, dto: UpdateExternalPresenterDto, adminId: string) {
    const row = await this.findWritable(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        await tx.user.update({
          where: { id: row.userId },
          data: {
            ...(dto.firstName !== undefined
              ? { firstName: dto.firstName }
              : {}),
            ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          },
        });
      }
      return tx.externalPresenter.update({
        where: { id },
        data: {
          ...(dto.organization !== undefined
            ? { organization: dto.organization }
            : {}),
          ...(dto.presentationTitle !== undefined
            ? { presentationTitle: dto.presentationTitle }
            : {}),
          updatedById: adminId,
        },
        include: presenterInclude,
      });
    });
    return toPresenterView(updated);
  }

  /**
   * Quitar de la edición: borrado lógico de la fila. La cuenta se conserva por si vuelve otra
   * edición; sin una fila activa no recibe certificado de esta.
   */
  async remove(id: number, adminId: string) {
    await this.findWritable(id);
    await this.prisma.externalPresenter.update({
      where: { id },
      data: { isActive: false, updatedById: adminId },
    });
    return { removed: true };
  }

  /**
   * El propio presentador: su registro en la edición activa o, si no está en ella, el más
   * reciente. No incluye el certificado: lo envía el administrador por correo.
   */
  async me(userId: string) {
    const active = await findActiveEdition(this.prisma);
    const rows = await this.prisma.externalPresenter.findMany({
      where: { userId, isActive: true },
      include: presenterInclude,
      orderBy: { editionId: 'desc' },
    });
    const row = rows.find((r) => r.editionId === active?.id) ?? rows[0];
    if (!row) throw this.notFound();
    return {
      ...toPresenterView(row),
      edition: { id: row.edition.id, title: row.edition.title },
    };
  }

  /** Fila activa de la edición activa (404 si no existe; 400 si es de una edición anterior). */
  async findWritable(id: number): Promise<PresenterRow> {
    const row = await this.prisma.externalPresenter.findFirst({
      where: { id, isActive: true },
      include: presenterInclude,
    });
    if (!row) throw this.notFound();
    if (row.edition.status !== EditionStatus.ACTIVE) {
      throw new BadRequestException({
        statusCode: 400,
        code: EXTERNAL_PRESENTER_READ_ONLY,
        message: `El presentador pertenece a «${row.edition.title}», que no es la edición activa. Las ediciones anteriores son de solo lectura.`,
      });
    }
    return row;
  }

  private async registerExistingAccount(
    userId: string,
    editionId: number,
    dto: CreateExternalPresenterDto,
    data: {
      organization: string | null;
      presentationTitle: string | null;
      updatedById: string;
    },
  ): Promise<ExternalPresenterView> {
    const current = await this.prisma.externalPresenter.findUnique({
      where: { presentador_usuario_edicion_unique: { userId, editionId } },
      select: { id: true, isActive: true },
    });
    if (current?.isActive) throw this.alreadyRegistered();

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: true,
        },
      });
      return current
        ? tx.externalPresenter.update({
            where: { id: current.id },
            data: { ...data, isActive: true, certificateSentAt: null },
            include: presenterInclude,
          })
        : tx.externalPresenter.create({
            data: { userId, editionId, ...data },
            include: presenterInclude,
          });
    });
    return toPresenterView(row);
  }

  private async presenterRoleId(): Promise<number> {
    const role = await this.prisma.role.findFirst({
      where: { name: EXTERNAL_PRESENTER_ROLE_NAME, isActive: true },
      select: { id: true },
    });
    if (!role) {
      throw new InternalServerErrorException(
        `Falta el rol "${EXTERNAL_PRESENTER_ROLE_NAME}": aplica la migración de HU-33.`,
      );
    }
    return role.id;
  }

  private alreadyRegistered() {
    return new ConflictException({
      statusCode: 409,
      code: EXTERNAL_PRESENTER_ALREADY_REGISTERED,
      message:
        'Esa persona ya está registrada como presentador externo en la edición activa.',
    });
  }

  private notFound() {
    return new NotFoundException({
      statusCode: 404,
      code: EXTERNAL_PRESENTER_NOT_FOUND,
      message: 'Presentador externo no encontrado.',
    });
  }
}
