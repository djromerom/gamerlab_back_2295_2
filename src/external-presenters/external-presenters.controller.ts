import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { sendCertificatePdf } from '../certificates/pdf-download';
import { editionIdQuery } from '../editions/list-edition';
import { ExcelExportService } from '../professors/excel-export.service';
import {
  CreateExternalPresenterDto,
  CreateExternalPresentersBulkDto,
  UpdateExternalPresenterDto,
} from './dto/external-presenter.dto';
import { ExternalPresenterCertificatesService } from './external-presenter-certificates.service';
import {
  buildExternalPresentersFileName,
  buildExternalPresentersWorkbook,
} from './external-presenters-export';
import { ExternalPresentersService } from './external-presenters.service';

/**
 * HU-33 (ARK-194): presentadores externos. Todo es del administrador (`ManageExternalPresenters`)
 * salvo `GET /external-presenters/me`, del propio presentador (`ViewOwnExternalPresenterProfile`).
 */
@ApiTags('External presenters')
@Controller('external-presenters')
@UseGuards(RolePermissionGuard)
export class ExternalPresentersController {
  private readonly logger = new Logger(ExternalPresentersController.name);

  constructor(
    private readonly presenters: ExternalPresentersService,
    private readonly certificates: ExternalPresenterCertificatesService,
  ) {}

  @Get('me')
  @RequiredService('ViewOwnExternalPresenterProfile')
  @ApiOperation({
    summary: 'Mi registro como presentador externo',
    description:
      'Edición activa o, si no está en ella, la más reciente. El presentador no descarga el certificado desde su cuenta: lo envía o lo descarga el administrador (`certificateSentAt` marca el envío por correo). 404 EXTERNAL_PRESENTER_NOT_FOUND si no tiene registro activo.',
  })
  me(@GetUser('id') userId: string) {
    return this.presenters.me(userId);
  }

  @Post()
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary:
      'Registrar un presentador externo en la edición activa (solo Administrador)',
    description:
      'Crea la cuenta con el rol «Presentador externo» y envía el correo de verificación. Si el correo ya es de un presentador (de otra edición), lo registra en la activa sin crear otra cuenta.',
  })
  @ApiBadRequestResponse({
    description: '`code: EMAIL_CONFIRMATION_MISMATCH` u otra validación.',
  })
  @ApiConflictResponse({
    description:
      '`code: EMAIL_IN_USE_BY_OTHER_ROLE` o `EXTERNAL_PRESENTER_ALREADY_REGISTERED`.',
  })
  create(
    @Body() dto: CreateExternalPresenterDto,
    @GetUser('id') adminId: string,
  ) {
    return this.presenters.create(dto, adminId);
  }

  @Post('bulk')
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary: 'Registrar varios presentadores a la vez (máximo 100)',
    description:
      'Si una fila tiene un formato inválido, responde 400 y no registra ninguna. Los demás problemas (correo de otro rol, ya registrado, repetido en la lista, correos que no coinciden) se informan por fila en `failed`.',
  })
  createMany(
    @Body() dto: CreateExternalPresentersBulkDto,
    @GetUser('id') adminId: string,
  ) {
    return this.presenters.createMany(dto.presenters, adminId);
  }

  @Get()
  @RequiredService('ManageExternalPresenters')
  @ApiQuery({ name: 'editionId', required: false, type: Number })
  @ApiOperation({
    summary: 'Presentadores de la edición (por defecto la activa)',
    description:
      'HU-39 (ARK-209): `teams` trae los equipos presentadores externos (equipos no calificables, marcados con `PATCH /teams/:id/gradable`) con sus integrantes activos y el título del proyecto.',
  })
  list(@Query('editionId') editionIdParam?: string) {
    return this.presenters.list(editionIdQuery(editionIdParam));
  }

  @Get('export')
  @RequiredService('ManageExternalPresenters')
  @ApiQuery({ name: 'editionId', required: false, type: Number })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOperation({
    summary: 'Excel de los presentadores de la edición (por defecto la activa)',
  })
  async export(
    @Res() res: Response,
    @Query('editionId') editionIdParam?: string,
  ) {
    const { edition, presenters, teams } = await this.presenters.exportData(
      editionIdQuery(editionIdParam),
    );
    try {
      const workbook = buildExternalPresentersWorkbook(
        presenters,
        edition.title,
        teams,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        ExcelExportService.buildContentDisposition(
          buildExternalPresentersFileName(edition),
        ),
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      this.logger.error(
        `Excel de presentadores externos: ${(error as Error)?.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo generar el archivo Excel.',
      );
    }
  }

  @Post('certificates/send-all')
  @HttpCode(200)
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary:
      'Enviar el certificado a todos los presentadores de la edición activa',
    description:
      'Uno por uno; los que fallan se informan en `failed` y no detienen a los demás.',
  })
  sendAll() {
    return this.certificates.sendAll();
  }

  @Post('teams/:teamId/certificate')
  @HttpCode(200)
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary: 'Enviar el certificado de presentador externo a un equipo no calificable',
    description:
      'HU-39 (ARK-209): un certificado por equipo, con sus integrantes activos y el título del proyecto, enviado al correo de cada integrante. 400 `CERTIFICATE_TEAM_GRADABLE` si el equipo no está marcado como no calificable.',
  })
  sendTeamCertificate(@Param('teamId', ParseIntPipe) teamId: number) {
    return this.certificates.sendTeam(teamId);
  }

  @Get('teams/:teamId/certificate')
  @RequiredService('ManageExternalPresenters')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Descargar el certificado de presentador externo de un equipo no calificable',
    description: 'HU-39 (ARK-209): no envía correos.',
  })
  async downloadTeamCertificate(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendCertificatePdf(res, await this.certificates.downloadTeam(teamId));
  }

  @Patch(':id')
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary: 'Editar nombre y datos del certificado (solo edición activa)',
    description:
      'El correo no se cambia. `organization` o `presentationTitle` en `null` los borra.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExternalPresenterDto,
    @GetUser('id') adminId: string,
  ) {
    return this.presenters.update(id, dto, adminId);
  }

  @Delete(':id')
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary: 'Quitar al presentador de la edición activa',
    description:
      'Borrado lógico de su registro en la edición; la cuenta se conserva.',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') adminId: string,
  ) {
    return this.presenters.remove(id, adminId);
  }

  @Post(':id/certificate')
  @HttpCode(200)
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary: 'Enviar el certificado de asistencia por correo (edición activa)',
  })
  sendOne(@Param('id', ParseIntPipe) id: number) {
    return this.certificates.sendOne(id);
  }

  @Get(':id/certificate')
  @RequiredService('ManageExternalPresenters')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Descargar el certificado de asistencia (edición activa)',
    description: 'No marca el certificado como enviado.',
  })
  async downloadCertificate(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendCertificatePdf(res, await this.certificates.download(id));
  }
}
