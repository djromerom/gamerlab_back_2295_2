/* eslint-disable prettier/prettier */
// src/email/email.controller.ts
import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  getSchemaPath,
  ApiOperation,
  ApiOkResponse,
  ApiTags,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { ResendAuthEmailDto } from './dto/resend-auth-email.dto';
import { ResendTeamEmailDto } from './dto/resend-team-email.dto';
import { ResendCertEmailDto } from './dto/resend-cert-email.dto';

@Controller('email')
@ApiTags('Email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('resend-auth-email')
  @ApiOperation({ summary: 'Resend auth email of a certain type to a user' })
  @ApiExtraModels(ResendAuthEmailDto)
  @ApiBody({ schema: { $ref: getSchemaPath(ResendAuthEmailDto) } })
  @ApiOkResponse({ description: 'Auth email resent successfully' })
  @ApiNotFoundResponse({
    description: 'User with the provided email does not exist',
  })
  @ApiBadRequestResponse({ description: 'Invalid type of email provided' })
  @HttpCode(200)
  async resendAuthEmailOfType(@Body() resendEmailDto: ResendAuthEmailDto) {
    return this.emailService.resendAuthEmailOfType(
      resendEmailDto.email,
      resendEmailDto.typeOfEmail,
    );
  }

  @Post('resend-team-email')
  @ApiOperation({ summary: 'Resend team email of a certain type to a team' })
  @ApiExtraModels(ResendTeamEmailDto)
  @ApiBody({ schema: { $ref: getSchemaPath(ResendTeamEmailDto) } })
  @ApiOkResponse({ description: 'Team email resent successfully' })
  @ApiNotFoundResponse({
    description: 'User with the provided email does not exist',
  })
  @ApiBadRequestResponse({ description: 'Invalid type of email provided' })
  @HttpCode(200)
  async resendTeamEmailOfType(@Body() resendEmailDto: ResendTeamEmailDto) {
    const params: Record<string, unknown> = {};
    if (
      resendEmailDto.typeOfEmail === 'VIDEOGAME_REJECTED' &&
      resendEmailDto.rejectionReason
    ) {
      params.rejectionReason = resendEmailDto.rejectionReason;
    }
    return this.emailService.resendTeamEmailOfType(
      resendEmailDto.email,
      resendEmailDto.typeOfEmail,
      params,
    );
  }

  @Post('resend-certificate-email')
  @ApiOperation({ summary: 'Resend certificate email to a team' })
  @ApiExtraModels(ResendCertEmailDto)
  @ApiBody({ schema: { $ref: getSchemaPath(ResendCertEmailDto) } })
  @ApiOkResponse({ description: 'Certificate email resent successfully' })
  @ApiNotFoundResponse({
    description: 'User with the provided email does not exist',
  })
  @ApiBadRequestResponse({ description: 'Invalid type of email provided' })
  @HttpCode(200)
  async resendCertificateEmail(@Body() resendEmailDto: ResendCertEmailDto) {
    return this.emailService.resendCertEmailOfType(
      resendEmailDto.email,
      resendEmailDto.typeOfEmail,
    );
  }
}
