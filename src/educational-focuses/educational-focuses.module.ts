import { Module } from '@nestjs/common';
import { EducationalFocusesService } from './educational-focuses.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [EducationalFocusesService],
  exports: [EducationalFocusesService]
})
export class EducationalFocusesModule { }
