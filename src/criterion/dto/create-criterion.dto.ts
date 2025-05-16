import { IsString, IsNumber} from 'class-validator';

export class CreateCriterionDto {
    @IsString()
    name: string; // Corresponds to 'nombre' in DB
  
    @IsString()
    description: string; // Corresponds to 'descripcion' in DB
  
    @IsNumber()
    weight: number; // Corresponds to 'peso' in DB
}
