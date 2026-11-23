import {
  BadRequestException,
  Controller,
  Get,
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { MulterExceptionFilter } from 'src/upload/multer-exception.filter';
import { JurorEditionImportService } from './juror-edition-import.service';
import { buildImportTemplate } from './juror-edition-import.xlsx';

const MAX_FILE_MB = 2;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const reportExample = {
  edition: { id: 5, title: 'Feria Gamer 2026-30' },
  summary: {
    total: 3,
    created: 1,
    confirmed: 1,
    alreadyConfirmed: 0,
    errors: 1,
    emailsQueued: 1,
  },
  rows: [
    {
      row: 2,
      email: 'ana.perez@empresa.com',
      firstName: 'Ana',
      lastName: 'Pérez',
      type: 'OFFICIAL',
      result: 'CREATED',
      accountCreated: true,
      emailStatus: 'QUEUED',
    },
    {
      row: 3,
      email: 'luis.gomez@empresa.com',
      firstName: 'Luis',
      lastName: 'Gómez',
      type: 'BACKUP',
      result: 'CONFIRMED',
      accountCreated: false,
      emailStatus: 'NOT_NEEDED',
    },
    {
      row: 4,
      email: 'correo-malo',
      firstName: 'Eva',
      lastName: 'Ruiz',
      type: null,
      result: 'ERROR',
      accountCreated: false,
      emailStatus: 'NOT_NEEDED',
      error: 'INVALID_EMAIL',
      message: 'El correo electrónico no es válido',
    },
  ],
};

/** HU-49 (ARK-280): importar desde Excel la lista de jurados de la edición activa. */
@ApiTags('Juror edition')
@Controller('juror-edition/import')
@UseGuards(RolePermissionGuard)
export class JurorEditionImportController {
  constructor(private readonly service: JurorEditionImportService) {}

  @Get('template')
  @RequiredService('ManageEditionJurors')
  @ApiOperation({
    summary: 'Descarga la plantilla de Excel para importar jurados',
    description:
      'Hoja «Jurados» con los encabezados Nombres, Apellidos, Correo y Tipo (Oficial o Suplente), y una hoja «Instrucciones».',
  })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx' })
  async template(): Promise<StreamableFile> {
    return new StreamableFile(await buildImportTemplate(), {
      type: XLSX_MIME,
      disposition: 'attachment; filename="plantilla-jurados.xlsx"',
    });
  }

  @Post()
  @RequiredService('ManageEditionJurors')
  @UseFilters(new MulterExceptionFilter(MAX_FILE_MB))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Importa jurados desde un Excel: los deja confirmados en la edición activa y crea las cuentas que falten',
    description:
      'Campo multipart «file» (.xlsx, máximo 2 MB y 500 filas). Cada fila se procesa por separado y el informe dice qué pasó con cada una (CREATED, CONFIRMED, ALREADY_CONFIRMED o ERROR con su motivo). Los correos para crear la contraseña salen después, en una cola con pausa (emailStatus QUEUED). Solo la edición activa.',
  })
  @ApiResponse({ status: 201, schema: { example: reportExample } })
  @ApiResponse({
    status: 400,
    description:
      'No es un xlsx, no sigue la plantilla, está vacío, tiene más de 500 filas, o la edición es de solo lectura. No se importa nada.',
  })
  @ApiResponse({ status: 404, description: 'No hay una edición activa' })
  @ApiResponse({ status: 413, description: 'El archivo pesa más de 2 MB' })
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @GetUser('id') actorId: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Falta el archivo: envíe el Excel en el campo «file».',
      );
    }
    return this.service.import(file.buffer, actorId);
  }
}
