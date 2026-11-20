import { Controller, Post, Body, Get, Param, Put, Patch, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateWeightDto } from './dto/create-weight.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminRoleGuard } from 'src/auth/guards/admin-role.guard';
import { UpdateRegistrationsDto } from './dto/update-registrations.dto';
import { UpdateVerificationCodesDto } from './dto/update-verification-codes.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('weights')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetWeight')
  @ApiOperation({ summary: 'Get weighting configuration for the latest edition' })
  @ApiResponse({ status: 200, description: 'Weighting configuration for the active edition', schema: { example: {
    id: 1,
    editionId: 2,
    seniorPct: 60,
    juniorPct: 40,
    createdAt: '2025-11-22T19:29:27.461Z',
    updatedAt: '2025-11-22T19:29:27.461Z'
  } } })
  @ApiResponse({ status: 404, description: 'ARK-130: sin edición activa (code NO_ACTIVE_EDITION) o la edición activa no tiene ponderados (code WEIGHTS_NOT_CONFIGURED)' })
  getLatest() {
    return this.settingsService.getLatest();
  }

  @Get('weights/:editionId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetWeight')
  @ApiOperation({ summary: 'Get weighting configuration for an edition' })
  @ApiParam({ name: 'editionId', type: Number, description: 'Edition identifier', example: 2 })
  @ApiResponse({ status: 200, description: 'Weighting configuration returned', schema: { example: {
    id: 1,
    editionId: 2,
    seniorPct: 60,
    juniorPct: 40,
    createdAt: '2025-11-22T19:29:27.461Z',
    updatedAt: '2025-11-22T19:29:27.461Z'
  } } })
  @ApiResponse({ status: 404, description: 'La edición no tiene ponderados (code WEIGHTS_NOT_CONFIGURED)' })
  getByEdition(@Param('editionId') editionId: string) {
    return this.settingsService.getByEdition(Number(editionId));
  }

  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageWeight')
  @Post('weights')
  @ApiOperation({ summary: 'Create or upsert weighting configuration for an edition' })
  @ApiBody({ schema: { example: { seniorPct: 60, juniorPct: 40 } }, type: CreateWeightDto })
  @ApiResponse({ status: 201, description: 'Weighting created/updated', schema: { example: {
    id: 1,
    editionId: 2,
    seniorPct: 60,
    juniorPct: 40,
    createdAt: '2025-11-22T19:29:27.461Z',
    updatedAt: '2025-11-22T19:29:27.461Z'
  } } })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  upsert(@Body() dto: CreateWeightDto) {
    return this.settingsService.upsertWeights(dto);
  }

  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageWeight')
  @Put('weights')
  @ApiOperation({ summary: 'Update or upsert weighting configuration (uses latest edition when editionId is omitted)' })
  @ApiBody({ schema: { example: { seniorPct: 60, juniorPct: 40 } }, type: CreateWeightDto })
  @ApiResponse({ status: 200, description: 'Weighting updated', schema: { example: {
    id: 1,
    editionId: 2,
    seniorPct: 60,
    juniorPct: 40,
    createdAt: '2025-11-22T19:29:27.461Z',
    updatedAt: '2025-11-22T19:29:27.461Z'
  } } })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  update(@Body() dto: CreateWeightDto) {
    return this.settingsService.upsertWeights(dto);
  }

  @Public()
  @Get('evaluations-status')
  @ApiOperation({
    summary: 'Get if evaluations are open',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns whether evaluations are open',
    schema: {
      example: {
        evaluationsOpen: true,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Event configuration not found',
  })
  getEvaluationsOpen() {
    return this.settingsService.getEvaluationsOpen();
  }

  @Patch('evaluations-status')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  @ApiOperation({ summary: 'Update evaluations open status' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the updated evaluations open status',
    schema: {
      example: { evaluationsOpen: false },
    },
  })
  updateEvaluationStatus(@Body() dto: { open: boolean }) {
    return this.settingsService.updateEvaluationStatus(dto.open);
  }

  @Public()
  @Get('show-ranking')
  @ApiOperation({ summary: 'Get if ranking is visible for users' })
  @ApiResponse({
    status: 200,
    description:
      'BG-67: true solo si el ranking está publicado y la nota final liberada (PATCH /final-grade/release)',
    schema: { example: { showRanking: true } },
  })
  getShowRanking() {
    return this.settingsService.getShowRanking();
  }

  @Patch('show-ranking')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  @ApiOperation({ summary: 'Update ranking visibility for users' })
  @ApiResponse({
    status: 200,
    description: 'Returns the updated ranking visibility',
    schema: { example: { showRanking: true } },
  })
  @ApiResponse({
    status: 400,
    description:
      'BG-67: show=true con la nota final sin liberar (code RANKING_REQUIRES_FINAL_GRADE)',
  })
  setShowRanking(@Body() dto: { show: boolean }) {
    return this.settingsService.setShowRanking(dto.show);
  }

  @Public()
  @Get('show-evaluations')
  @ApiOperation({ summary: 'Get if evaluations are visible for users' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether evaluations are visible',
    schema: { example: { showEvaluations: true } },
  })
  getShowEvaluations() {
    return this.settingsService.getShowEvaluation();
  }

  @Patch('show-evaluations')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  @ApiOperation({ summary: 'Update evaluations visibility for users' })
  @ApiResponse({
    status: 200,
    description: 'Returns the updated evaluations visibility',
    schema: { example: { showEvaluations: true } },
  })
  setShowEvaluations(@Body() dto: { show: boolean }) {
    return this.settingsService.setShowEvaluation(dto.show);
  }

  @Public()
  @Get('registrations')
  @ApiOperation({ summary: 'Get if team registrations are open (public)' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether registrations are open; false when the active edition has no configuration',
    schema: { example: { registrationsOpen: true } },
  })
  getRegistrationsOpen() {
    return this.settingsService.getRegistrationsOpen();
  }

  @Patch('registrations')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Open or close team registrations (administrators only)' })
  @ApiBody({ schema: { example: { open: true } }, type: UpdateRegistrationsDto })
  @ApiResponse({
    status: 200,
    description: 'Returns the updated registrations status',
    schema: { example: { registrationsOpen: true } },
  })
  setRegistrationsOpen(@Body() dto: UpdateRegistrationsDto) {
    return this.settingsService.setRegistrationsOpen(dto.open);
  }

  @Get('verification-codes')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  @ApiOperation({
    summary: '«Exigir código de verificación a los jurados» de la edición activa (HU-50)',
    description:
      'Para Configuración del evento. Sin configuración de la edición activa responde true (valor por defecto). ' +
      '`changedAt` y `changedBy` son el último cambio (null si nunca se cambió).',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        verificationCodesEnabled: true,
        changedAt: null,
        changedBy: null,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  getVerificationCodes() {
    return this.settingsService.getVerificationCodes();
  }

  @Patch('verification-codes')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  @ApiOperation({
    summary: 'Prender o apagar el código de verificación de todos los equipos (HU-50)',
    description:
      'Solo Administrador. Con { enabled: false } ningún equipo de la edición activa pide código y los jurados califican directamente. ' +
      'Con { enabled: true } vuelve a pedirse, salvo en los equipos que tienen el código desactivado (PATCH /team-verification/:teamId/required). ' +
      'No regenera códigos ni borra verificaciones. Guarda quién y cuándo si el valor cambia.',
  })
  @ApiBody({ schema: { example: { enabled: false } }, type: UpdateVerificationCodesDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        verificationCodesEnabled: false,
        changedAt: '2026-11-26T15:10:00.000Z',
        changedBy: { id: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01', name: 'Allison Ruiz' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Body inválido' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'La edición activa no tiene configuración (`code: EVENT_CONFIGURATION_NOT_FOUND`)',
  })
  setVerificationCodes(
    @Body() dto: UpdateVerificationCodesDto,
    @GetUser('id') adminId: string,
  ) {
    return this.settingsService.setVerificationCodes(dto.enabled, adminId);
  }
}
