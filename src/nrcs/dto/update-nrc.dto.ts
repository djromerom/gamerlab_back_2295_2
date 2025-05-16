import { PartialType } from '@nestjs/mapped-types';
import { CreateNrcDto } from './create-nrc.dto';

export class UpdateNrcDto extends PartialType(CreateNrcDto) {}
