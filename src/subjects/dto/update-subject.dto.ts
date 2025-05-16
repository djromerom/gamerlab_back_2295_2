// src/subjects/dto/update-subject.dto.ts
import { PartialType } from '@nestjs/mapped-types'; // Easily create update DTOs
import { CreateSubjectDto } from './create-subject.dto';

// Allows all fields from CreateSubjectDto to be optional
export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
