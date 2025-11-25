/* eslint-disable prettier/prettier */
// src/email/email.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  ParseIntPipe,
  Query,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiExtraModels, getSchemaPath, ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { TeamEmailType } from './types/team-email.type';
import { ResendAuthEmailDto } from './dto/resend-auth-email.dto';
import { ResendTeamEmailDto } from './dto/resend-team-email.dto';
import { ResendCertEmailDto } from './dto/resend-cert-email.dto';

@Controller('email')
@ApiTags('Email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}
  
  @Post('resend-auth-email')
  @ApiOperation({ summary: 'Resend auth email of a certain type to a user' })
  @HttpCode(200)
  async resendAuthEmailOfType(@Body() resendEmailDto: ResendAuthEmailDto) {
    return this.emailService.resendAuthEmailOfType(resendEmailDto.email, resendEmailDto.typeOfEmail);
  }

  @Post('resend-team-email')
  @ApiOperation({ summary: 'Resend team email of a certain type to a team' })
  @HttpCode(200)
  async resendTeamEmailOfType(@Body() resendEmailDto: ResendTeamEmailDto) {
    return this.emailService.resendTeamEmailOfType(resendEmailDto.email, resendEmailDto.typeOfEmail);
  }

  @Post('resend-certificate-email')
  @ApiOperation({ summary: 'Resend certificate email to a team' })
  @HttpCode(200)
  async resendCertificateEmail(@Body() resendEmailDto: ResendCertEmailDto) {
    return this.emailService.resendCertEmailOfType(resendEmailDto.email, resendEmailDto.typeOfEmail, resendEmailDto.certificate);
  }
}