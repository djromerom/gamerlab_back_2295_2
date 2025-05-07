// src/members/members.module.ts
import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],  // Para usar Prisma
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}