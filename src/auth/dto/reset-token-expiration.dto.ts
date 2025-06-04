import { IsNotEmpty, IsUUID } from 'class-validator';

export class ResetTokenExpirationDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}