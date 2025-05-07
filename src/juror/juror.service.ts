import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { Prisma, User } from '@prisma/client';



@Injectable()
export class JurorService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}
  
  private readonly JUROR_ROLE_ID = 4;

  async create(dto: CreateJurorDto): Promise<User> {

    let user;
    try {
      const result = await this.auth.registerUser({
        email: dto.email,
        name: dto.name,
      });
  
      user = result.user as { id: string; email: string };
  
      if (!user || !user.id) {
        throw new InternalServerErrorException(
          `Supabase no devolvió un ID de usuario para el email: ${dto.email}`,
        );
      }
  
    } catch (error) {
      if (error.message?.includes('User already registered')) {
        throw new ConflictException(
          `El email ${dto.email} ya está registrado.`,
        );
      }
  
      throw new InternalServerErrorException(
        `Error durante el registro en Supabase para ${dto.email}: ${error.message}`,
      );
    }
  
    try {
      const juror = await this.prisma.user.create({
        data: {
          id: user.id,
          name: dto.name,
          email: dto.email,
          username: dto.name,
          roleId: this.JUROR_ROLE_ID,
          isActive: true,
        },
      });
  
      return juror;
  
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Ya existe un jurado con el email ${dto.email} o el ID ${user.id}.`,
          );
        }
      }
  
      throw new InternalServerErrorException(
        `No se pudo guardar el jurado en la base de datos para ${dto.email}: ${error.message}`,
      );
    }
  }
  
  
  
  

  findAll() {
    return this.prisma.user.findMany({
      where: { 
        roleId: this.JUROR_ROLE_ID, 
        isActive: true,   
      },
      select: {
        id: true,
        name: true,
        email: true,
        confirmationStatusId: true,
        updatedAt: true,
        _count: {
          select: {
            evaluationsSubmitted: true,
          },
        },
      },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
  
    if (!user) {
      throw new NotFoundException('User not found');
    }
  
    if (user.roleId !== this.JUROR_ROLE_ID) {
      throw new NotFoundException('User is not a juror');
    }
  
    if (!user.isActive) {
      throw new NotFoundException('User is not active');
    }
  
    return user;
  }
  
  async update(id: string, dto: UpdateJurorDto):Promise<User> {
    const existingjuror = await this.findOne(id);

    if (!existingjuror || existingjuror.roleId !== this.JUROR_ROLE_ID) {
      throw new NotFoundException(`Professor with ID ${id} not found.`);
    }
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique(
        { where: { email: dto.email, isActive: true, } });

      if (existingEmail && existingEmail.id !== id){
        throw new ConflictException('Email is already in use by another user');
      }
    }

    return this.prisma.user.update({
      where: { id: existingjuror.id },
      data: dto,
    });
  }

  async remove(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user|| user.roleId !== this.JUROR_ROLE_ID) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false,
        }, 
    });
  }
}
