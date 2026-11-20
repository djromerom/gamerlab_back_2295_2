import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ASSIGNMENT_RULES_DOC } from '../assignment-validation/assignment-validation.swagger';
import { BulkAssignTeamsDto } from '../dto/bulk-assign-teams.dto';
import { JurorAssignmentBulkService } from './juror-assignment-bulk.service';

const BULK_RESPONSE_EXAMPLE = {
  message:
    'Se asignaron 2 equipos al jurado. 1 equipo no se asignó por un bloqueo.',
  edicion: { id: 5, title: 'Feria Gamer 2026-30' },
  jurado: { id: 'd4e5f6a7-b8c9-4123-d456-678901234567', nombre: 'Ana Pérez' },
  resultados: [
    {
      equipoId: 12,
      codigo: 'N1-AYP-06',
      nombre: 'Los Pixeles',
      videojuego: 'Pixel Quest',
      estado: 'ASSIGNED',
      advertencias: [],
      cantidadJurados: 3,
      bloqueo: null,
    },
    {
      equipoId: 15,
      codigo: 'N1-AYP-07',
      nombre: 'Byte Club',
      videojuego: 'Byte Run',
      estado: 'ASSIGNED_WITH_WARNINGS',
      advertencias: [
        {
          code: 'JUROR_OVER_LIMIT',
          message:
            'El jurado senior Ana Pérez quedaría con 4 grupos; el máximo recomendado es 3 por jurado.',
          jurorId: 'd4e5f6a7-b8c9-4123-d456-678901234567',
        },
      ],
      cantidadJurados: 4,
      bloqueo: null,
    },
    {
      equipoId: 18,
      codigo: 'N0-COLEGIOS-01',
      nombre: 'Colegio Demo',
      videojuego: 'Demo',
      estado: 'BLOCKED',
      advertencias: [],
      cantidadJurados: null,
      bloqueo: {
        code: 'SCHOOL_REQUIRES_SENIOR',
        message:
          'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0). Los colegios solo los califican jurados senior (profesores).',
      },
    },
  ],
  totales: { solicitados: 3, asignados: 2, bloqueados: 1 },
  advertenciasAceptadas: [],
};

/** HU-42 (ARK-275): asignar varios equipos a un jurado a la vez. */
@ApiTags('Juror')
@Controller('juror/assignments')
@UseGuards(RolePermissionGuard)
@RequiredService('AssignJurors')
export class JurorAssignmentBulkController {
  constructor(private readonly service: JurorAssignmentBulkService) {}

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Asignar varios equipos a un jurado en una sola operación',
    description: `
      Asigna a un jurado (o profesor) todos los equipos de \`teamIds\` de la edición activa.
      Cada equipo se valida con las mismas reglas de \`POST /juror/assignments\` (HU-08).

      - **Por equipo:** un equipo inexistente o con un bloqueo no se asigna y sale en \`resultados\`
        como \`BLOCKED\` con su \`bloqueo\` (\`code\` y \`message\`); los demás sí se asignan. Si todos
        quedan bloqueados responde 200 con todos en \`BLOCKED\` y no se guarda nada.
      - **Advertencias juntas:** se calculan sobre los equipos que sí se asignan. Sin
        \`confirmWarnings: true\` responde 409 \`ASSIGNMENT_WARNINGS\` con \`warnings\` y \`blocked\`
        (los equipos que no se asignarán) y no se guarda nada.
      - **Una transacción:** si algo falla al guardar, no se asigna ningún equipo.
      - Una fila de bitácora por equipo y un solo aviso push al jurado.
      - Un problema del jurado (no existe, no participa en la edición, rol inválido) frena todo con 4xx.
      ${ASSIGNMENT_RULES_DOC}
    `,
  })
  @ApiOkResponse({
    description: 'Resultado por equipo',
    schema: { example: BULK_RESPONSE_EXAMPLE },
  })
  @ApiBadRequestResponse({
    description:
      'Datos inválidos, o el jurado no es jurado/profesor o no participa en la edición activa',
  })
  @ApiConflictResponse({
    description:
      'Advertencias sin confirmar (`code: ASSIGNMENT_WARNINGS`, con `warnings` y `blocked`). Reenviar con `confirmWarnings: true`.',
  })
  @ApiNotFoundResponse({
    description: 'Jurado no encontrado o no hay edición activa',
  })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'Sin permisos' })
  assignMany(
    @Body() dto: BulkAssignTeamsDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.service.assignMany(dto, actorUserId);
  }
}
