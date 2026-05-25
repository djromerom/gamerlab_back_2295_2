import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeletePhotosDto {
  @ApiProperty({
    description: 'Array of Upload IDs to delete',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000', '987fcdeb-51a2-43d7-9012-34567890abcd'],
  })
  @IsArray({ message: 'uploadIds debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debe proporcionar al menos un ID para eliminar' })
  @IsUUID('all', { each: true, message: 'Cada ID debe ser un UUID válido' })
  uploadIds: string[];
}
