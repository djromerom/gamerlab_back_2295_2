import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ResetTokenExpirationDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  typeOfToken: string;
}