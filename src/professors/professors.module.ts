import { Module } from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { ProfessorsController } from './professors.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProfessorsController],
  providers: [ProfessorsService],
})
export class ProfessorsModule {}
