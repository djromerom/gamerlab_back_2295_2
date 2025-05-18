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
import { ProfessorsService } from './professors.service';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { User } from "@prisma/client";
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { Public } from 'src/auth/decorators/public.decorator';
import { SelectOption, professorNrc } from './types/select-option.type';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) { }

  @Post()
  create(@Body() createProfessorDto: CreateProfessorDto) {
    return this.professorsService.create(createProfessorDto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const { includeInactive, limit, page } = query;
    return this.professorsService.findAll(includeInactive, limit, page);
  }

  @Public()
  @Get('select-options')
  async findSelectOptions(): Promise<SelectOption[]> {
    return this.professorsService.findForSelect();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.professorsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProfessorDto: UpdateProfessorDto,
  ) {
    return this.professorsService.update(id, updateProfessorDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.professorsService.remove(id);
  }

  @Get('/nrc')
  nrcFp(@GetUser('id') id: string): Promise<professorNrc[]> {
      return this.professorsService.nrcProfessor(id);
  }
}
