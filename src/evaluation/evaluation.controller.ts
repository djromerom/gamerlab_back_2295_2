import { UseGuards } from '@nestjs/common';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { Body, Controller, Post } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { AppUser } from 'src/auth/supabase.strategy';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('evaluation')
export class EvaluationController {
    constructor(private readonly evaluationService: EvaluationService) { }

    @Post('with-details')
    @UseGuards(RolePermissionGuard)
    @RequiredService('Create Evaluation')
    async createEvaluationWithDetails(
        @Body() evaluationPayload: CreateEvaluationDto,
        @GetUser() user: AppUser
    ) {
        return this.evaluationService.createEvaluationWithDetails(user.id, evaluationPayload);
    }
}
