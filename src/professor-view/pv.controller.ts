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
import { ReportNrcDto } from './dto/report-nrc.dto';
import { ReportSubjectDto } from './dto/report-subject.dto';

@Controller('professorview')
export class ProfessorViewController {
    constructor(private readonly professorViewService: ProfessorViewService) { }

    @Get('nrc-report/:nrcCode')
    async GetReportByNRC(
        @Param('nrcCode') nrcCode: number,
        @Query() query: Omit<ReportNrcDto, 'nrcCode'>
    ) {
        const { includeInactive, limit, page } = query;
        return this.professorViewService.getNRCreport(nrcCode, includeInactive, limit, page);
    }

    @Get('signature-report/:subjectName')
    async getSignatureReport(
        @Param('subjectName') subjectName: string,
        @Query() query: Omit<ReportSubjectDto, 'subjectName'>
    ) {
        const { includeInactive, limit, page } = query;
        return this.professorViewService.GetSignatureReport(subjectName, includeInactive, limit, page);
    }
}