/* eslint-disable prettier/prettier */
// src/teams/dto/create-email-request.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateEmailRequestDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  id: string;
}