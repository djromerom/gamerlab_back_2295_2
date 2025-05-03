// src/teams/dto/create-team.dto.ts
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
  teamName: string;  // <-- Usa el nombre exacto de tu schema.prisma

  @IsString()
  @IsNotEmpty({ message: 'El ID del creador es obligatorio' })
  ownerId: string;
}