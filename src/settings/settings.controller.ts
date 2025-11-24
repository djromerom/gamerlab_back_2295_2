import { Controller, Post, Body, Get, Param, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CreateWeightDto } from './dto/create-weight.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';

@ApiTags('Settings/Weights')
@Controller('settings/weights')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
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

  @Get(':editionId')
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
  @Post()
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
  @Put()
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
}