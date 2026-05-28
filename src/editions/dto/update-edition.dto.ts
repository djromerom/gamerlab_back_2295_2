import { PartialType } from '@nestjs/swagger';
import { CreateEditionDto } from './create-edition.dto';

export class UpdateEditionDto extends PartialType(CreateEditionDto) {}
