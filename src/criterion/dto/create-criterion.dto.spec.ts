import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCriterionDto } from './create-criterion.dto';

describe('CreateCriterionDto', () => {
  it('crear criterio con espacios al final guarda el nombre sin espacios', async () => {
    const dto = plainToInstance(CreateCriterionDto, {
      name: '  Creatividad  ',
      description: 'desc',
      weight: 10,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Creatividad');
  });
});
