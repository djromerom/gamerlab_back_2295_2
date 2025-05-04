import {
  Controller,
  Get,
  Post,
  Body,
  Patch, // Cambiado Put por Patch si solo actualizas campos parciales (más común)
  Param,
  Delete,
  ParseUUIDPipe, // Importa ParseUUIDPipe para validar que el ID es un UUID válido
  HttpCode, // Importa HttpCode para DELETE
  HttpStatus, // Importa HttpStatus para DELETE
} from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';

@Controller('professors') // Ruta base para profesores
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) {}

  @Post()
  create(@Body() createProfessorDto: CreateProfessorDto) {
    // El servicio maneja la lógica de creación
    return this.professorsService.create(createProfessorDto);
  }

  @Get()
  findAll() {
    // El servicio obtiene todos los profesores activos
    return this.professorsService.findAll();
  }

  @Get(':id')
  findOne(
    // Usa ParseUUIDPipe para validar que el ID recibido en la URL es un UUID
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Pasa el ID como string directamente al servicio
    return this.professorsService.findOne(id);
  }

  @Patch(':id') // Usar Patch para actualizaciones parciales es más idiomático
  update(
    @Param('id', ParseUUIDPipe) id: string, // Valida el ID como UUID
    @Body() updateProfessorDto: UpdateProfessorDto,
  ) {
    // Pasa el ID como string directamente al servicio
    return this.professorsService.update(id, updateProfessorDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // Devuelve 204 No Content en lugar del objeto eliminado (práctica común en DELETE)
  async remove(
    @Param('id', ParseUUIDPipe) id: string, // Valida el ID como UUID
  ): Promise<void> {
    // El método no necesita devolver el objeto eliminado
    // Llama al servicio para realizar el soft delete
    await this.professorsService.remove(id);
    // No se devuelve nada en el cuerpo de la respuesta (código 204)
  }
}
