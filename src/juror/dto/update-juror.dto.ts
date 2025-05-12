import { PartialType } from '@nestjs/mapped-types';
import { CreateJurorDto } from './create-juror.dto';

export class UpdateJurorDto extends PartialType(CreateJurorDto) {}
