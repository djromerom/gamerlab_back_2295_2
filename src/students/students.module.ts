import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { EditionStudentsService } from './edition-students.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentsController],
  providers: [StudentsService, EditionStudentsService],
})
export class StudentsModule {}