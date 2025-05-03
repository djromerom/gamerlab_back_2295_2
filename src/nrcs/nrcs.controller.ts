import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { CreateNrcDto } from './dto/create-nrc.dto';
import { UpdateNrcDto } from './dto/update-nrc.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';

@UseGuards(AuthGuard('supabase'), RolePermissionGuard)
@Controller('nrcs')
export class NrcsController {
  constructor(private readonly nrcsService: NrcsService) {}

  @Post()
  @RequiredService('Create Subject')
  create(@Body() createNrcDto: CreateNrcDto) {
    return this.nrcsService.create(createNrcDto);
  }

  @Get()
  @RequiredService('List Subjects')
  findAll() {
    return this.nrcsService.findAll();
  }

  @Get(':id')
  @RequiredService('Get Subject By ID')
  findOne(@Param('id') id: string) {
    return this.nrcsService.findOne(+id);
  }

  @Patch(':id')
  @RequiredService('Update Subject (PATCH)')
  update(@Param('id') id: string, @Body() updateNrcDto: UpdateNrcDto) {
    return this.nrcsService.update(+id, updateNrcDto);
  }

  @Delete(':id')
  @RequiredService('Delete Subject')
  remove(@Param('id') id: string) {
    return this.nrcsService.remove(+id);
  }
}
