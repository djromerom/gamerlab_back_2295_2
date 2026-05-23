import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTestimonialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  role: string;

  @IsString()
  @IsNotEmpty()
  quote: string;
}
