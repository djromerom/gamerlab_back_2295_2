import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException, // Para manejar errores específicos de creación/update
  BadRequestException, // Para manejar casos como intentar eliminar a alguien ya inactivo
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service'; // Ajusta la ruta si es necesario
import { AuthService } from 'src/auth/auth.service'; // Ajusta la ruta si es necesario
import { Prisma, User } from '@prisma/client';
import { CreateProfessorDto } from './dto/create-professor.dto'; // Asegúrate de tener este DTO
import { UpdateProfessorDto } from './dto/update-professor.dto'; // Asegúrate de tener este DTO

@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private readonly professorRoleId = 3; // Define el roleId para profesores

  constructor(
    private readonly authService: AuthService, // Inyecta AuthService
    private readonly prismaService: PrismaService, // Inyecta PrismaService
  ) {}

  /**
   * Creates a new professor.
   * First registers the user in Supabase via AuthService,
   * then creates the corresponding user record in the local DB with roleId = 3.
   */
  async create(createProfessorDto: CreateProfessorDto): Promise<User> {
    this.logger.log(
      `Attempting to create professor: ${createProfessorDto.email}`,
    );

    // 1. Registrar en Supabase (obtiene el usuario de Supabase con su ID)
    let supabaseUser;
    try {
      // Asumiendo que registerUser devuelve { user: { id: string, email: string, ... } }
      const result = await this.authService.registerUser({
        email: createProfessorDto.email,
        name: createProfessorDto.name,
      });
      supabaseUser = result.user as { id: string; email: string }; // Asegura el tipo mínimo

      if (!supabaseUser || !supabaseUser.id) {
        this.logger.error(
          `Supabase registration failed or did not return a user ID for email: ${createProfessorDto.email}`,
        );
        throw new InternalServerErrorException(
          'User registration failed at authentication provider.',
        );
      }
      this.logger.log(
        `Supabase user registered successfully: ${supabaseUser.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error during Supabase registration for ${createProfessorDto.email}: ${error.message}`,
        error.stack,
      );
      // Podrías querer manejar errores específicos de Supabase (ej: email ya existe)
      if (error.message?.includes('User already registered')) {
        // Ejemplo de manejo
        throw new ConflictException(
          `Email ${createProfessorDto.email} is already registered.`,
        );
      }
      throw error; // Re-lanza otros errores (InternalServerError, etc.)
    }

    // 2. Crear en Base de Datos Local (Prisma)
    try {
      const newProfessor = await this.prismaService.user.create({
        data: {
          id: supabaseUser.id, // Usa el ID de Supabase
          name: createProfessorDto.name, // Nombre proporcionado
          email: createProfessorDto.email, // Email proporcionado
          username: createProfessorDto.name, // Incluye username si está en el DTO
          roleId: this.professorRoleId, // Asigna el rol de profesor
          // Los demás campos (isActive, confirmationStatusId, etc.) usarán los @default del schema Prisma
        },
      });
      this.logger.log(
        `Professor created successfully in local DB: ${newProfessor.id}`,
      );
      return newProfessor;
    } catch (error) {
      this.logger.error(
        `Error creating professor in local DB for ${createProfessorDto.email} (Supabase ID: ${supabaseUser.id}): ${error.message}`,
        error.stack,
      );
      // Error común: Ya existe un usuario con ese ID o email localmente (si hubo fallo previo)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Código de error de violación de unicidad
          throw new ConflictException(
            `Professor with email ${createProfessorDto.email} or ID ${supabaseUser.id} already exists locally.`,
          );
        }
      }
      // Podríamos intentar deshacer el registro en Supabase aquí, pero es complejo.
      // Mejor loguear y lanzar error.
      throw new InternalServerErrorException(
        'Failed to save professor profile locally after registration.',
      );
    }
  }

  /**
   * Finds all active professors.
   */
  async findAll(): Promise<User[]> {
    this.logger.log('Finding all active professors');
    return this.prismaService.user.findMany({
      where: {
        roleId: this.professorRoleId, // Debe tener el rol de profesor
        isActive: true, // Debe estar activo
      },
    });
  }

  async findOne(id: string): Promise<User> {
    this.logger.log(`Finding professor with ID: ${id}`);
    const professor = await this.prismaService.user.findUnique({
      where: {
        id: id, // El ID es string
      },
      // include: { role: true } // Ejemplo si necesitas el rol
    });

    // Verifica si se encontró, si es profesor y si está activo
    if (
      !professor ||
      professor.roleId !== this.professorRoleId ||
      !professor.isActive
    ) {
      this.logger.warn(
        `Professor not found, not a professor, or inactive for ID: ${id}`,
      );
      throw new NotFoundException(
        `Professor with ID ${id} not found or is inactive.`,
      );
    }

    return professor;
  }

  /**
   * Updates a professor's data.
   * Ensures the user exists and is a professor before updating.
   */
  async update(
    id: string,
    updateProfessorDto: UpdateProfessorDto,
  ): Promise<User> {
    this.logger.log(`Attempting to update professor with ID: ${id}`);

    // 1. Verifica si el usuario existe, es profesor y está activo (opcional, podrías permitir actualizar inactivos)
    const existingProfessor = await this.prismaService.user.findUnique({
      where: { id: id },
    });

    if (
      !existingProfessor ||
      existingProfessor.roleId !== this.professorRoleId
    ) {
      this.logger.warn(
        `Update failed: User ${id} not found or is not a professor.`,
      );
      throw new NotFoundException(`Professor with ID ${id} not found.`);
    }

    // Opcional: Si no quieres permitir actualizar profesores inactivos
    /*
     if (!existingProfessor.isActive) {
         this.logger.warn(`Update failed: Professor ${id} is inactive.`);
         throw new BadRequestException(`Cannot update an inactive professor.`);
     }
     */

    // 2. Realiza la actualización
    // Asegúrate que UpdateProfessorDto NO incluya campos como id, email, roleId, isActive, etc.
    // Deberías validar/sanitizar el DTO antes de pasarlo a Prisma.
    try {
      const updatedProfessor = await this.prismaService.user.update({
        where: {
          id: id, // ID es string
        },
        data: updateProfessorDto, // Pasa los datos del DTO
      });
      this.logger.log(`Professor ${id} updated successfully.`);
      return updatedProfessor;
    } catch (error) {
      this.logger.error(
        `Error updating professor ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Manejar errores específicos de Prisma si es necesario (ej: P2002 si intentas cambiar algo a un valor único ya existente)
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Update failed due to unique constraint violation.`,
          );
        }
      }
      throw new InternalServerErrorException(
        `Failed to update professor ${id}.`,
      );
    }
  }

  /**
   * Soft deletes a professor by setting isActive to false.
   * Ensures the user exists, is a professor, and is currently active.
   */
  async remove(id: string): Promise<User> {
    this.logger.log(`Attempting to soft delete professor with ID: ${id}`);

    // 1. Busca el profesor
    const professor = await this.prismaService.user.findUnique({
      where: { id: id },
    });

    // 2. Verifica si existe, es profesor y si YA está inactivo
    if (!professor || professor.roleId !== this.professorRoleId) {
      this.logger.warn(
        `Soft delete failed: User ${id} not found or is not a professor.`,
      );
      throw new NotFoundException(`Professor with ID ${id} not found.`);
    }

    if (!professor.isActive) {
      this.logger.warn(
        `Soft delete failed: Professor ${id} is already inactive.`,
      );
      throw new BadRequestException(
        `Professor with ID ${id} is already inactive.`,
      );
    }

    // 3. Realiza el soft delete (actualiza isActive a false)
    try {
      const deactivatedProfessor = await this.prismaService.user.update({
        where: { id: id },
        data: { isActive: false },
      });
      this.logger.log(`Professor ${id} soft deleted successfully.`);
      return deactivatedProfessor;
    } catch (error) {
      this.logger.error(
        `Error during soft delete for professor ${id}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to deactivate professor ${id}.`,
      );
    }
  }
}
