/* eslint-disable prettier/prettier */
// src/email/email.module.ts
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { CertificatesModule } from 'src/certificates/certificates.module';

@Module({
  imports: [PrismaModule, ConfigModule, HttpModule, CertificatesModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
