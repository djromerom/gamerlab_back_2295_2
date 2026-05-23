import { Module } from '@nestjs/common';
import { TestimonialsService } from './testimonials.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TestimonialsService],
  exports: [TestimonialsService]
})
export class TestimonialsModule { }
