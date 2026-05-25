import { PartialType } from '@nestjs/mapped-types';
import { CreateHistoricalDto } from './create-historical.dto';

export class UpdateHistoricalDto extends PartialType(CreateHistoricalDto) {}
