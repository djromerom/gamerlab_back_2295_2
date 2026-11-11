import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CertificatesService } from './certificates.service';
import { EmailService } from 'src/email/email.service';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiProduces, ApiQuery } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CERT_EMAIL_CONFIG, CertEmailType } from 'src/email/types/cert-email.type';
import { sendCertificatePdf } from './pdf-download';

// ── DTO inline (o muévelo a certificates/dto/send-juror-cert.dto.ts) ──
class SendJurorCertDto {
  @IsString()
  @IsUUID()
  userId: string; // Los jurados son Users — el id es UUID string
}

class DownloadTeamCertificateQuery {
  @IsOptional()
  @IsIn(Object.keys(CERT_EMAIL_CONFIG))
  type?: CertEmailType;
}

@ApiTags('Certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly emailService: EmailService,
  ) {}

  // ─────────────────────────────────────────────
  // POST /certificates/juror
  // Genera y envía por email el certificado de UN jurado
  // ─────────────────────────────────────────────
  @Post('juror')
  @UseGuards(RolePermissionGuard)
  @RequiredService('certificates')
  @ApiOperation({ summary: 'Send juror participation certificate by email' })
  @ApiBody({ type: SendJurorCertDto })
  @ApiResponse({ status: 201, description: 'Certificate sent successfully' })
  @ApiResponse({ status: 404, description: 'User (juror) not found' })
  async sendJurorCertificate(@Body() body: SendJurorCertDto) {
    return this.emailService.resendJurorCertEmail(body.userId);
  }

  // ─────────────────────────────────────────────
  // POST /certificates/juror/all
  // Genera y envía el certificado a TODOS los jurados activos
  // ─────────────────────────────────────────────
  @Post('juror/all')
  @UseGuards(RolePermissionGuard)
  @RequiredService('certificates')
  @ApiOperation({ summary: 'Send juror participation certificate to ALL active jurors' })
  @ApiResponse({ status: 201, description: 'Bulk send completed' })
  async sendAllJurorCertificates() {
    return this.emailService.sendAllJurorCertificates();
  }

  // ─────────────────────────────────────────────
  // ARK-170 (TA-19): descarga individual para el administrador
  // ─────────────────────────────────────────────
  @Get('team/:teamId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('certificates')
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'type', required: false, enum: Object.keys(CERT_EMAIL_CONFIG) })
  @ApiOperation({
    summary: 'Descargar el certificado de un equipo (edición activa y confirmado)',
    description:
      'Por defecto el de participación. 404 `CERTIFICATE_TEAM_NOT_FOUND`; 400 `CERTIFICATE_TEAM_NOT_CONFIRMED` o `CERTIFICATE_TEAM_WITHOUT_MEMBERS`.',
  })
  async downloadTeamCertificate(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: DownloadTeamCertificateQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendCertificatePdf(
      res,
      await this.certificatesService.downloadTeamCertificate(
        teamId,
        query.type ?? 'PARTICIPATION_CERTIFICATE',
      ),
    );
  }

  @Get('juror/:userId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('certificates')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descargar el certificado de un jurado de la edición activa' })
  async downloadJurorCertificate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendCertificatePdf(
      res,
      await this.certificatesService.downloadJurorCertificate(userId),
    );
  }
}