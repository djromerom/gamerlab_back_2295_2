import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';

export const STAFF_ROLE_NAME = 'Staff';

/**
 * HU-11: cuentas del rol Staff (mesa de escarapelas). Reutiliza el registro de
 * jurados: se crea el usuario con su correo y la persona completa la cuenta con
 * el enlace de verificación (contraseña) o con Microsoft.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(dto: CreateStaffDto) {
    const role = await this.prisma.role.findFirst({
      where: { name: STAFF_ROLE_NAME, isActive: true },
      select: { id: true },
    });
    if (!role) {
      throw new InternalServerErrorException(
        `Falta el rol "${STAFF_ROLE_NAME}": aplica la migración de HU-11.`,
      );
    }

    // Registro y rol en una sola transacción: si algo falla no queda un usuario a medias.
    const { staff, verificationToken } = await this.prisma
      .$transaction(async (tx) => {
        const { user, verificationToken } =
          await this.auth.registerUserTransaction({ email: dto.email }, tx);
        const staff = await tx.user.update({
          where: { id: user.id },
          data: {
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            roleId: role.id,
            isActive: true,
            lastSignInAt: null,
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
        return { staff, verificationToken };
      })
      .catch((error: unknown) => {
        if (error instanceof ConflictException) {
          throw new ConflictException('Ya existe un usuario con ese correo');
        }
        throw error;
      });

    this.auth
      .sendVerificationEmail(staff.email, verificationToken)
      .catch((err: unknown) =>
        this.logger.error(
          `No se pudo enviar el correo de verificación al staff ${staff.id}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return { ...staff, role: STAFF_ROLE_NAME };
  }
}
