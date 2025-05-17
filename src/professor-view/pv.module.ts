import { Module } from '@nestjs/common';
import { ProfessorViewService } from './pv.service';
import { ProfessorViewController } from './pv.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProfessorViewController],
  providers: [ProfessorViewService],
})
export class ProfessorViewModule {}
