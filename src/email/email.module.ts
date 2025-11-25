/* eslint-disable prettier/prettier */
// src/email/email.module.ts
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    HttpModule, // Add HttpModule for any HTTP requests that might be needed
  ],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService], // Export EmailService so it can be used by other modules
})
export class EmailModule {}