import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get('evaluations')
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
}
