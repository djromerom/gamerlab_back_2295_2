// src/subjects/subjects.module.ts
import { Module } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';
import { PrismaModule } from '../prisma/prisma.module'; // <-- IMPORT PrismaModule

@Module({
  imports: [PrismaModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {} // Corrected spelling
