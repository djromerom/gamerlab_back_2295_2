import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  CheckInMethod,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
  Prisma,
} from '@prisma/client';

import { AuthService } from 'src/auth/auth.service';
import {
  findUsersByEmailCaseInsensitive,
  normalizeEmail,
} from 'src/common/utils/find-user-by-email';
import {
  ActiveEdition,
  requireActiveEdition,
} from 'src/editions/active-edition';
import { JUROR_ROLE_NAME } from 'src/jurors/juror-badges/juror-label';
import {
  ENROLLABLE_ROLE_NAMES,
  jurorsOfEdition,
} from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWalkInJurorDto } from './dto/create-walk-in-juror.dto';
import { findSimilarPeople } from './similar-people.logic';
import {
  EMAIL_ALREADY_EXISTS,
  ExistingPerson,
  SIMILAR_PEOPLE,
  WalkInJurorResult,
} from './types/walk-in-juror.types';

/** Tope de coincidencias por nombre que se devuelven (la pantalla muestra una lista corta). */
const MAX_MATCHES = 10;

const fullName = (person: {
  firstName: string | null;
  lastName: string | null;
}) => `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();

/**
 * HU-24 (ARK-217): alta de un jurado que llegó a la feria sin estar registrado.
 *
 * - Siempre **Junior y Suplente** (regla del 28 de octubre): la petición no trae categoría ni tipo.
 * - Queda inscrito en la edición activa como **Confirmado** (HU-25) con la marca `walkIn`, y con
 *   su **llegada registrada** a mano por el administrador (HU-11). Sin escarapela ni QR.
 * - **Todo o nada:** cuenta, inscripción y llegada van en una transacción. El correo para crear
 *   la contraseña sale después de confirmar; si falla, el jurado queda creado y el administrador
 *   lo reenvía con `POST /juror/resend-confirmation`.
 * - **Duplicados:** un correo que ya existe responde 409 con esa persona (nunca se crea otra
 *   cuenta ni se cambia la que hay: quien ya estaba registrado conserva su tipo y sus grupos).
 *   Un nombre parecido entre jurados y profesores responde 409 hasta que el administrador
 *   confirma con `confirmSimilar`.
 */
@Injectable()
export class WalkInJurorService {
  private readonly logger = new Logger(WalkInJurorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(
    dto: CreateWalkInJurorDto,
    actorUserId: string,
  ): Promise<WalkInJurorResult> {
    const email = normalizeEmail(dto.email);
    const name = { firstName: dto.firstName, lastName: dto.lastName };

    try {
      const edition = await requireActiveEdition(this.prisma);
      await this.assertEmailIsFree(email, edition);
      if (!dto.confirmSimilar) await this.assertNoSimilarPeople(name, edition);

      const { user, verificationToken, attendance } = await this.save(
        email,
        name,
        edition,
        actorUserId,
      );

      // Después de confirmar la transacción: un fallo del correo no deshace el alta.
      setImmediate(() => {
        this.auth
          .sendVerificationEmail(user.email, verificationToken)
          .catch((error) => {
            this.logger.error(
              `HU-24: no se pudo enviar el correo de creación de cuenta al jurado ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      });

      return {
        juror: {
          id: user.id,
          name: fullName(name),
          email: user.email,
          category: JurorCategory.JUNIOR,
          type: JurorType.BACKUP,
        },
        edition: { id: edition.id, title: edition.title },
        attendance,
        walkIn: true,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('HU-24: error al dar de alta al jurado:', error);
      throw new InternalServerErrorException(
        'No se pudo dar de alta al jurado. Se revirtió todo y no se creó ninguna cuenta.',
      );
    }
  }

  /** Cuenta, inscripción en la edición y llegada: o quedan las tres o ninguna. */
  private async save(
    email: string,
    name: { firstName: string; lastName: string },
    edition: ActiveEdition,
    actorUserId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.findFirst({
          where: { name: JUROR_ROLE_NAME },
          select: { id: true },
        });
        if (!role) {
          throw new InternalServerErrorException(
            'No existe el rol Jurado. Avisa al equipo técnico.',
          );
        }

        // Crea la cuenta y el enlace para definir la contraseña (igual que Personal → Jurados).
        const { user, verificationToken } =
          await this.auth.registerUserTransaction({ email }, tx);

        await tx.user.update({
          where: { id: user.id },
          data: {
            ...name,
            roleId: role.id,
            isActive: true,
            jurorCategory: JurorCategory.JUNIOR,
            jurorType: JurorType.BACKUP,
            lastSignInAt: null,
          },
        });
        await tx.jurorEdition.create({
          data: {
            jurorId: user.id,
            editionId: edition.id,
            status: JurorEditionStatus.CONFIRMED,
            type: JurorType.BACKUP,
            walkIn: true,
            updatedById: actorUserId,
          },
        });
        const attendance = await tx.jurorAttendance.create({
          data: {
            jurorId: user.id,
            editionId: edition.id,
            checkedInById: actorUserId,
            method: CheckInMethod.MANUAL,
          },
          select: { checkedInAt: true, method: true },
        });

        return { user, verificationToken, attendance };
      });
    } catch (error) {
      // Dos altas simultáneas con el mismo correo: la segunda responde igual que el duplicado.
      const duplicated =
        error instanceof ConflictException ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002');
      if (!duplicated) throw error;
      await this.assertEmailIsFree(email, edition);
      throw new ConflictException({
        statusCode: 409,
        code: EMAIL_ALREADY_EXISTS,
        message: 'Ya existe una cuenta con ese correo. No se creó nada.',
      });
    }
  }

  /** 409 `EMAIL_ALREADY_EXISTS` con la persona dueña del correo (cualquier rol, activa o no). */
  private async assertEmailIsFree(email: string, edition: ActiveEdition) {
    const owners = await findUsersByEmailCaseInsensitive(this.prisma, email);
    if (owners.length === 0) return;

    const [existing] = await this.describe(
      [owners.find((owner) => owner.email === email) ?? owners[0]].map(
        (owner) => owner.id,
      ),
      edition,
    );
    throw new ConflictException({
      statusCode: 409,
      code: EMAIL_ALREADY_EXISTS,
      message: this.emailMessage(existing, edition),
      existing,
    });
  }

  private emailMessage(existing: ExistingPerson, edition: ActiveEdition) {
    const who = `${existing.name || 'Una persona'} (${existing.role})`;
    if (existing.checkedInAt) {
      return `Ese correo ya es de ${who}, que ya tiene su llegada registrada en «${edition.title}». No se creó nada.`;
    }
    if (existing.isJurorOfEdition) {
      return `Ese correo ya es de ${who}, que es jurado de «${edition.title}». No se creó nada: marca su llegada.`;
    }
    if (ENROLLABLE_ROLE_NAMES.includes(existing.role) && existing.isActive) {
      return `Ese correo ya es de ${who}, que no es jurado de «${edition.title}». No se creó nada: inscríbelo o confírmalo en Jurados de la edición.`;
    }
    return `Ese correo ya es de ${who}. No se creó nada.`;
  }

  /** 409 `SIMILAR_PEOPLE` si hay jurados o profesores activos con un nombre parecido. */
  private async assertNoSimilarPeople(
    name: { firstName: string; lastName: string },
    edition: ActiveEdition,
  ) {
    // Son cientos de cuentas a lo sumo: se comparan en memoria, sin tildes ni mayúsculas.
    const people = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { name: { in: [...ENROLLABLE_ROLE_NAMES] } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    const similar = findSimilarPeople(name, people).slice(0, MAX_MATCHES);
    if (similar.length === 0) return;

    const matches = await this.describe(
      similar.map((person) => person.id),
      edition,
    );
    throw new ConflictException({
      statusCode: 409,
      code: SIMILAR_PEOPLE,
      message:
        matches.length === 1
          ? `Ya hay una persona con un nombre parecido: ${matches[0].name} (${matches[0].role}). Si es la misma, usa la que existe; si no, confirma para crear al jurado.`
          : `Ya hay ${matches.length} personas con un nombre parecido. Si es una de ellas, usa la que existe; si no, confirma para crear al jurado.`,
      matches,
    });
  }

  /** Lo que el administrador necesita ver de cada persona existente, en el orden de `ids`. */
  private async describe(
    ids: string[],
    edition: ActiveEdition,
  ): Promise<ExistingPerson[]> {
    const [users, jurors] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isActive: true,
          role: { select: { name: true } },
          jurorEditions: {
            where: { editionId: edition.id },
            select: { status: true },
            take: 1,
          },
          attendances: {
            where: { editionId: edition.id, isActive: true },
            select: { checkedInAt: true },
            take: 1,
          },
        },
      }),
      // La única definición de «jurado de la edición» (HU-25).
      this.prisma.user.findMany({
        where: jurorsOfEdition(edition.id, ids),
        select: { id: true },
      }),
    ]);
    const jurorIds = new Set(jurors.map((juror) => juror.id));

    return ids.flatMap((id) => {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) return [];
      return [
        {
          id: user.id,
          name: fullName(user),
          role: user.role.name,
          isActive: user.isActive,
          isJurorOfEdition: jurorIds.has(user.id),
          editionStatus: user.jurorEditions[0]?.status ?? null,
          checkedInAt: user.attendances[0]?.checkedInAt ?? null,
        },
      ];
    });
  }
}
