import { PartialType } from '@nestjs/swagger';
import { CreateEducationalFocusDto } from './create-educational-focus.dto';

export class UpdateEducationalFocusDto extends PartialType(CreateEducationalFocusDto) {}
