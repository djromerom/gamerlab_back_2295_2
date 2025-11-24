import { Controller, Get, UseGuards, Patch, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
  updateEvaluationStatus(@Body() open: boolean) {
    return this.settingsService.updateEvaluationStatus(open);
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
  setShowRanking(@Body() show: boolean) {
    return this.settingsService.setShowRanking(show);
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
  setShowEvaluations(@Body() show: boolean) {
    return this.settingsService.setShowEvaluation(show);
  }
}
