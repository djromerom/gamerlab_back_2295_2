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
import { AuthEmailType } from './types/email-type.type';
import { ResendEmailDto } from './dto/resend-email.dto';
import { ResetTokenExpirationDto } from './dto/reset-token-expiration.dto';

@Controller('email')
@ApiTags('Email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}
  
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend verification email to a user' })
  @HttpCode(200)
  async resendVerificationEmail(@Body() resendEmailDto: ResendEmailDto) {
    return this.emailService.resendEmailOfType(resendEmailDto.email, resendEmailDto.typeOfEmail);
  }

  @Post('reset-token-expiration')
  @ApiOperation({ summary: 'Reset token expiration for a user' })
  @HttpCode(200)
  async resetTokenExpiration(@Body() resetTokenDto: ResetTokenExpirationDto) {
    await this.emailService.resetTokenExpiration(resetTokenDto.userId, resetTokenDto.typeOfToken);
    return { message: 'Token expiration reset successfully' };
  }
}