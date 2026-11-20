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
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ASSIGNMENT_CONFLICT_DOC } from '../assignment-validation/assignment-validation.swagger';
import { BulkAssignSubstitutesDto } from '../dto/bulk-assign-substitutes.dto';
import { SubstituteAssignmentService } from './substitute-assignment.service';

const BULK_SUBSTITUTE_EXAMPLE = {
  message:
    'Se agregaron 3 asignaciones de suplentes en 3 grupos. Nadie perdió grupos.',
  edicion: { id: 5, title: 'Feria 2026-2' },
  suplentes: [
    {
      id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
      nombre: 'Laura Gómez',
      equiposAgregados: [
        { id: 12, codigo: 'N1-AYP-06', nombre: 'Pixel Hunters' },
        { id: 15, codigo: 'N1-AYP-09', nombre: 'Code Knights' },
        { id: 18, codigo: 'N1-AYP-11', nombre: 'Byte Me' },
      ],
      equiposYaAsignados: [],
    },
  ],
  juradosCubiertos: [
    {
      id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
      nombre: 'Ana Pérez',
      equiposCubiertos: 3,
    },
  ],
  juradosSinGrupos: [],
  equiposNoAsignables: [],
  totales: {
    equiposCubiertos: 3,
    asignacionesAgregadas: 3,
    asignacionesOmitidas: 0,
  },
  advertenciasAceptadas: [],
};

/** HU-09 (ARK-215): suplentes asignados en lote a los grupos de uno o varios jurados. */
@ApiTags('Juror')
@Controller('juror/assignments/substitutes')
@UseGuards(RolePermissionGuard)
@RequiredService('AssignJurors')
export class SubstituteAssignmentController {
  constructor(private readonly service: SubstituteAssignmentService) {}

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Asignar suplentes a los grupos de uno o varios jurados (en lote)',
    description: `
      Agrega cada suplente de \`substituteIds\` a todos los grupos que hoy tienen en la edición
      activa los jurados de \`jurorIds\`. **Solo suma:** los jurados originales conservan sus
      grupos y las evaluaciones hechas no se tocan; un grupo puede quedar con más de 3 jurados.
      Los pares que ya existen se omiten (\`equiposYaAsignados\`). Los grupos sin confirmar o no
      calificables no reciben jurados y salen en \`equiposNoAsignables\`.

      Se aplican las reglas de HU-08 a todos los pares nuevos a la vez: un bloqueo responde 400
      con su \`code\` y no guarda nada; las advertencias responden 409 \`ASSIGNMENT_WARNINGS\` y se
      guardan reenviando con \`confirmWarnings: true\`. Todo va en una transacción: pares,
      bitácora (una fila ASSIGN por par, nota «Suplente en lote desde módulo admin (HU-09).») y
      un aviso de HU-22 por suplente con todos sus grupos nuevos. Si algo falla, no cambia nada.

      **400 propios:** \`SUBSTITUTE_IS_COVERED_JUROR\` (el mismo usuario en las dos listas),
      \`NOT_AN_EVALUATOR\` (jurado a cubrir que no existe, está inactivo o no es jurado ni
      profesor), \`NOT_A_SUBSTITUTE\` (no es suplente confirmado de la edición activa) y
      \`NO_TEAMS_TO_COVER\` (los jurados no tienen grupos asignables en la edición activa).
    `,
  })
  @ApiOkResponse({
    description:
      'Resumen por suplente. Si no había nada nuevo que agregar responde 200 con `asignacionesAgregadas: 0` y no crea avisos.',
    schema: { example: BULK_SUBSTITUTE_EXAMPLE },
  })
  @ApiBadRequestResponse({
    description:
      'Datos inválidos, códigos propios (ver descripción) o bloqueo de HU-08 (`SCHOOL_REQUIRES_SENIOR`, `MISSING_JUROR_CATEGORY`, `UNREADABLE_TEAM_LEVEL`...)',
  })
  @ApiConflictResponse(ASSIGNMENT_CONFLICT_DOC)
  @ApiNotFoundResponse({
    description: 'No hay edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'Sin permisos' })
  @ApiInternalServerErrorResponse({
    description: 'Error al guardar: se revirtió todo',
  })
  assignInBulk(
    @Body() dto: BulkAssignSubstitutesDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.service.assignToJurorsTeams(dto, actorUserId);
  }
}
