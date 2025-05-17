import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ProfessorViewService } from './pv.service';
import { User } from "@prisma/client";
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('professorview')
export class ProfessorViewController {
    constructor(private readonly professorViewService: ProfessorViewService) { }

    @Get('nrc-report/:nrcCode')
    async GetReportByNRC(@Param('nrcCode') nrcCode: number) {
        return this.professorViewService.getNRCreport(nrcCode);
    }

    @Get('signature-report/:subjectName')
    async getSignatureReport(@Param('subjectName') subjectName: string) {
        return this.professorViewService.GetSignatureReport(subjectName);
    }
}