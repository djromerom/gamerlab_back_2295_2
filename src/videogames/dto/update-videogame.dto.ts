import { PartialType } from '@nestjs/mapped-types';
import { VideogameDto } from 'src/teams/dto/videogame.dto';

export class UpdateVideogameDto extends PartialType(VideogameDto) {}
