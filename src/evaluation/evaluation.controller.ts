import { UseGuards } from '@nestjs/common';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { Body, Controller, Post } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { CreateDetailEvaluationDto } from './dto/createEvaluationDetails.dto';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { AppUser } from 'src/auth/supabase.strategy';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('evaluation')
export class EvaluationController {
    constructor(private readonly evaluationService: EvaluationService) { }

    @Post()
    @UseGuards(RolePermissionGuard)
    @RequiredService('Create Evaluation')
    async createEvaluation(@Body() evaluationPayload: CreateEvaluationDto, @GetUser() user: AppUser) {
        return this.evaluationService.createEvaluation(user.id, evaluationPayload);
    }

    @Post('details')

    @RequiredService('Create Evaluation')
    async createDetailsEvaluation(@Body() detailsPayload: { details: CreateDetailEvaluationDto[] }) {
        return this.evaluationService.createEvaluationDetails(detailsPayload.details);
    }
}