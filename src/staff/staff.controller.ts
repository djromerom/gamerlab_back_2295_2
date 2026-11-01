import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffService } from './staff.service';

@ApiTags('Staff')
@Controller('staff')
@UseGuards(RolePermissionGuard)
@RequiredService('ManageStaffAccounts')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({
    summary: 'Crea una cuenta del rol Staff (mesa de escarapelas)',
    description:
      'Envía el correo de verificación para que la persona complete su cuenta. Solo Administrador.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        id: '0b8f4c1e-2a3d-4e5f-8a9b-1c2d3e4f5a6b',
        email: 'ana.perez@uninorte.edu.co',
        firstName: 'Ana',
        lastName: 'Pérez',
        role: 'Staff',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un usuario con ese correo',
  })
  create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }
}
