import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { MailerService } from '@nestjs-modules/mailer';
import { v4 as uuidv4 } from 'uuid';



@Injectable()
export class JurorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
  ) {}
  

  private readonly JUROR_ROLE_ID = 4;

  async create(dto: CreateJurorDto):Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }
    const confirmationToken = uuidv4(); // Genera un token único (UUID)
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        roleId: this.JUROR_ROLE_ID,
        isActive: true,
        confirmationStatusId: 2, // Pendiente
      },
    });
  
    // Enviar el correo de confirmación
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Confirma tu cuenta',
      html: `<p>Hola ${user.name},</p>
             <p>Por favor confirma tu cuenta haciendo clic en el siguiente enlace:</p>
             <a href="http://localhost:3000/auth/confirm?token=${confirmationToken}">Confirmar cuenta</a>`,
    });
  
    return user;
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
    const user = await this.findOne(id);

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail && existingEmail.id !== id){
        throw new ConflictException('Email is already in use by another user');
      }
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: dto,
    });
  }

  async remove(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false,
        confirmationStatusId: 3 
        }, 
    });
  }
}
