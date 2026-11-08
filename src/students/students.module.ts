import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { EditionStudentsService } from './edition-students.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FinalGradeModule } from '../final-grade/final-grade.module';

@Module({
  imports: [PrismaModule, FinalGradeModule],
  controllers: [StudentsController],
  providers: [StudentsService, EditionStudentsService],
})
export class StudentsModule {}