import { Controller, Post, Body, Get, Param, Put, Patch, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateWeightDto } from './dto/create-weight.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('weigths')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetWeight')
  @ApiOperation({ summary: 'Get weighting configuration for the latest edition' })
  @ApiResponse({ status: 200, description: 'Weighting configuration for latest edition', schema: { example: {
    id: 1,
    editionId: 2,
    seniorPct: 60,
    juniorPct: 40,
    createdAt: '2025-11-22T19:29:27.461Z',
    updatedAt: '2025-11-22T19:29:27.461Z'
  } } })
  @ApiResponse({ status: 404, description: 'Weighting not found for latest edition' })
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
  @ApiResponse({ status: 404, description: 'Weighting not found' })
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
    summary: 'Get if evaluations are open and the end date of the event',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns whether evaluations are open and the event end date',
    schema: {
      example: {
        evaluationsOpen: true,
        endDate: '2024-12-31T23:59:59.000Z',
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
      'Returns the updated evaluations open status and event end date',
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
    description: 'Returns whether the ranking is visible',
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
}
