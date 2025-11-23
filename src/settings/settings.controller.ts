import { Controller, Get, UseGuards, Patch, Query } from '@nestjs/common';
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
  updateEvaluationStatus(@Query('open') open: boolean) {
    return this.settingsService.updateEvaluationStatus(open);
  }

  @Public()
  @Get('show-ranking')
  getShowRanking() {
    return this.settingsService.getShowRanking();
  }

  @Patch('show-ranking')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  setShowRanking(@Query('show') show: boolean) {
    return this.settingsService.setShowRanking(show);
  }

  @Public()
  @Get('show-evaluations')
  getShowEvaluations() {
    return this.settingsService.getShowEvaluation();
  }

  @Patch('show-evaluations')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateSettings')
  setShowEvaluations(@Query('show') show: boolean) {
    return this.settingsService.setShowEvaluation(show);
  }
}
