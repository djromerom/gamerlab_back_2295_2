import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { CreateWalkInJurorDto } from './dto/create-walk-in-juror.dto';
import { WalkInJurorService } from './walk-in-juror.service';

const existingExample = {
  id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
  name: 'Laura Gómez Ruiz',
  role: 'Jurado',
  isActive: true,
  isJurorOfEdition: true,
  editionStatus: 'CONFIRMED',
  checkedInAt: null,
};

/** HU-24 (ARK-217): jurado de último momento. Solo Administrador (el Staff no tiene el permiso). */
@ApiTags('Walk-in jurors')
@Controller('walk-in-jurors')
@UseGuards(RolePermissionGuard)
@RequiredService('ManageWalkInJurors')
export class WalkInJurorController {
  constructor(private readonly walkInJurors: WalkInJurorService) {}

  @Post()
  @ApiOperation({
    summary:
      'Dar de alta a un jurado que llegó sin estar registrado y marcar su llegada (HU-24)',
    description: `
      Crea la cuenta como **Junior y Suplente**, la inscribe en la edición activa como
      **Confirmado** con la marca \`walkIn\` y registra su **llegada** (manual, con quien la hizo),
      todo en una transacción. Envía el correo para crear la contraseña; si el envío falla, el
      jurado queda creado y se reenvía con \`POST /juror/resend-confirmation\`.

      **Duplicados.** Si el correo ya existe responde 409 \`EMAIL_ALREADY_EXISTS\` con esa persona
      en \`existing\` y no cambia nada: si \`isJurorOfEdition\` es \`true\` y \`checkedInAt\` es
      \`null\`, márcale la llegada con \`POST /juror-checkin/manual\`. Si hay jurados o profesores
      con un nombre parecido responde 409 \`SIMILAR_PEOPLE\` con la lista en \`matches\`; para
      crear igual se reenvía con \`confirmSimilar: true\`.
    `,
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        juror: {
          id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
          name: 'Laura Gómez Ruiz',
          email: 'laura.gomez@ejemplo.com',
          category: 'JUNIOR',
          type: 'BACKUP',
        },
        edition: { id: 5, title: 'ARKAD 2026-30' },
        attendance: {
          checkedInAt: '2026-11-26T14:12:05.000Z',
          method: 'MANUAL',
        },
        walkIn: true,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Datos no válidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'No hay edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  @ApiResponse({
    status: 409,
    description:
      '`EMAIL_ALREADY_EXISTS` (trae `existing`) o `SIMILAR_PEOPLE` (trae `matches`)',
    schema: {
      example: {
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message:
          'Ese correo ya es de Laura Gómez Ruiz (Jurado), que es jurado de «ARKAD 2026-30». No se creó nada: marca su llegada.',
        existing: existingExample,
      },
    },
  })
  create(
    @Body() dto: CreateWalkInJurorDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.walkInJurors.create(dto, actorUserId);
  }
}
