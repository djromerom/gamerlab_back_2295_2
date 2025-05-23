import { IsArray, IsInt, ArrayNotEmpty } from 'class-validator';

export class EditNrcDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  nrcCodes: number[];
}