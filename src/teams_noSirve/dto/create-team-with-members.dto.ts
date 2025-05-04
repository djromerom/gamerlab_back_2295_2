import { IsString, IsArray, ValidateNested, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

class MemberDto {
  @IsString()
  nombre: string;  // Se dividirá en firstName y lastName

  @IsEmail()
  correo: string;

  @IsString()
  codigoEstudiantil: string;

  @IsArray()
  @IsString({ each: true })
  nrc: string[];   // Códigos de NRC como strings
}

export class CreateTeamWithMembersDto {
  @IsString()
  //Validar
  teamName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members: MemberDto[];
}