import { BadRequestException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import {
  assertWritable,
  isWritable,
  toEditionSummary,
} from './edition-resolver';

describe('assertWritable (HU-25, nota 1 de #218)', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const past = new Date('2026-05-30T00:00:00Z');
  const future = new Date('2027-05-30T00:00:00Z');

  it('la edición activa siempre acepta cambios, aunque ya haya terminado', () => {
    expect(() =>
      assertWritable({ status: EditionStatus.ACTIVE, endsAt: past }, now),
    ).not.toThrow();
  });

  it('una edición inactiva que aún no termina (se está preparando) acepta cambios', () => {
    expect(() =>
      assertWritable({ status: EditionStatus.INACTIVE, endsAt: future }, now),
    ).not.toThrow();
  });

  it('una edición inactiva que ya terminó es de solo lectura (400)', () => {
    expect(() =>
      assertWritable({ status: EditionStatus.INACTIVE, endsAt: past }, now),
    ).toThrow(
      new BadRequestException(
        'La edición ya terminó: su lista de jurados es de solo lectura',
      ),
    );
  });

  it('justo en la fecha de fin ya es de solo lectura', () => {
    expect(() =>
      assertWritable({ status: EditionStatus.INACTIVE, endsAt: now }, now),
    ).toThrow(BadRequestException);
  });

  it('una edición archivada es de solo lectura aunque su fecha sea futura', () => {
    expect(() =>
      assertWritable({ status: EditionStatus.ARCHIVED, endsAt: future }, now),
    ).toThrow(
      new BadRequestException(
        'La edición está archivada: su lista de jurados es de solo lectura',
      ),
    );
  });

  it('isWritable coincide con assertWritable', () => {
    expect(
      isWritable({ status: EditionStatus.INACTIVE, endsAt: future }, now),
    ).toBe(true);
    expect(
      isWritable({ status: EditionStatus.INACTIVE, endsAt: past }, now),
    ).toBe(false);
  });

  it('el resumen de la edición informa si se puede modificar', () => {
    const summary = toEditionSummary({
      id: 2,
      title: 'Feria 2024-10',
      status: EditionStatus.INACTIVE,
      year: 2024,
      semester: 10,
      endsAt: past,
    });
    expect(summary).toEqual({
      id: 2,
      title: 'Feria 2024-10',
      status: EditionStatus.INACTIVE,
      writable: false,
    });
  });
});
