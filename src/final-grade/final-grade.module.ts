import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FinalGradeController } from './final-grade.controller';
import { FinalGradeService } from './final-grade.service';

/** HU-20 (ARK-80): liberación y consulta de la nota final del estudiante. */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FinalGradeController],
  providers: [FinalGradeService],
  exports: [FinalGradeService],
})
export class FinalGradeModule {}
