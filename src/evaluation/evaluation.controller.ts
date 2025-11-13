import { UseGuards } from '@nestjs/common';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { Body, Controller, Post } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { AppUser } from 'src/auth/jwt.strategy';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

@ApiTags('Evaluation')
@Controller('evaluation')
export class EvaluationController {
    constructor(private readonly evaluationService: EvaluationService) { }

    @Post('with-details')
    @UseGuards(RolePermissionGuard)
    @RequiredService('Create Evaluation')
    @ApiBearerAuth()
    @ApiOperation({
      summary: 'Create evaluation with details',
      description: 'Creates a new evaluation with detailed criteria scores.',
    })
    @ApiBody({
      type: CreateEvaluationDto,
      description: 'Evaluation data with criteria scores',
    })
    @ApiOkResponse({
      description: 'Evaluation created successfully',
    })
    @ApiBadRequestResponse({ description: 'Invalid evaluation data' })
    @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
    @ApiForbiddenResponse({ description: 'User does not have permission to create evaluations' })
    async createEvaluationWithDetails(
        @Body() evaluationPayload: CreateEvaluationDto,
        @GetUser() user: AppUser
    ) {
        return this.evaluationService.createEvaluationWithDetails(user.id, evaluationPayload);
    }
}
