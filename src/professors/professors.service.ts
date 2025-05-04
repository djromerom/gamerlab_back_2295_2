import { Injectable } from '@nestjs/common';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { User as SupabaseUser } from '@supabase/supabase-js';

@Injectable()
export class ProfessorsService {
  constructor(
    private authService: AuthService,
    private prismaService: PrismaService,
  ) {}

  async create(createProfessorDto: CreateProfessorDto) {
    const { user } = await this.authService.registerUser(createProfessorDto);
    return this.prismaService.user.create({
      data: {
        id: user.id,
        name: createProfessorDto.name,
        email: createProfessorDto.email,
        roleId: 3,
      },
    });
  }

  findAll() {
    return `This action returns all professors`;
  }

  findOne(id: number) {
    return `This action returns a #${id} professor`;
  }

  update(id: number, updateProfessorDto: UpdateProfessorDto) {
    return `This action updates a #${id} professor`;
  }

  remove(id: number) {
    return `This action removes a #${id} professor`;
  }
}
