import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JurorService } from './juror.service';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { JurorListItem } from './types/juror-list-item.type';
import { AuthService } from '../auth/auth.service';

@Controller('juror')
export class JurorController {
  constructor(
    private readonly jurorService: JurorService,
    private readonly authService: AuthService,
  ) {}

  @Get('evaluations-assignment')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  AsignEvaluations() {
    return this.jurorService.asingEvaluations();
  }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateJuror')
  create(@Body() dto: CreateJurorDto) {
    return this.jurorService.create(dto);
  }

  @Post('resend-confirmation')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SendEmail')
  async resendConfirmation(@Body('email') email: string) {
    return await this.authService.resendConfirmationEmail(email);
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<JurorListItem>> {
    const { includeInactive, limit, page } = query;
    return this.jurorService.findAll(includeInactive, limit, page);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetJuror')
  findOne(@Param('id') id: string) {
    return this.jurorService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateJuror')
  update(@Param('id') id: string, @Body() dto: UpdateJurorDto) {
    return this.jurorService.update(id, dto);
  }

  @Patch(':id/delete')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteJurror')
  softdelete(@Param('id') id: string) {
    return this.jurorService.remove(id);
  }
}