import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * HU-08: `confirmWarnings: true` guarda aunque la asignación tenga
 * advertencias. Solo el booleano `true` (o el texto "true") confirma.
 */
export function ConfirmWarningsField() {
  return applyDecorators(
    ApiPropertyOptional({
      type: Boolean,
      default: false,
      description:
        'Confirma las advertencias de HU-08 (409 ASSIGNMENT_WARNINGS) y guarda igual. No salta los bloqueos.',
    }),
    IsOptional(),
    Transform(
      ({ obj }: { obj: Record<string, unknown> }) =>
        obj.confirmWarnings === true || obj.confirmWarnings === 'true',
    ),
    IsBoolean({ message: 'confirmWarnings debe ser verdadero o falso' }),
  );
}
