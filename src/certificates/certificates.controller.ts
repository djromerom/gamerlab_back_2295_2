import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { EmailService } from 'src/email/email.service';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

// ── DTO inline (o muévelo a certificates/dto/send-juror-cert.dto.ts) ──
class SendJurorCertDto {
  @IsString()
  @IsUUID()
  userId: string; // Los jurados son Users — el id es UUID string
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
}