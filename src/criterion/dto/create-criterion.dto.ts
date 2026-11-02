import { IsString, IsNumber} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCriterionDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    name: string; // Corresponds to 'nombre' in DB
  
    @IsString()
    description: string; // Corresponds to 'descripcion' in DB
  
    @IsNumber()
    weight: number; // Corresponds to 'peso' in DB
}
