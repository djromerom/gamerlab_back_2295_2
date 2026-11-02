import { jurorsOfEdition, professorsOfEdition } from './jurors-of-edition';

describe('jurorsOfEdition (HU-25)', () => {
  it('exige la cuenta activa y combina jurados confirmados con profesores con NRC activo en la edición', () => {
    expect(jurorsOfEdition(5)).toEqual({
      isActive: true,
      OR: [
        {
          role: { name: 'Jurado' },
          jurorEditions: { some: { editionId: 5, status: 'CONFIRMED' } },
        },
        {
          role: { name: 'Profesor' },
          managedNrcs: { some: { editionId: 5, isActive: true } },
        },
      ],
    });
  });

  it('restringe a los ids pedidos sin cambiar la regla', () => {
    const where = jurorsOfEdition(5, ['a', 'b']);
    expect(where.id).toEqual({ in: ['a', 'b'] });
    expect(where.OR).toEqual(jurorsOfEdition(5).OR);
  });

  it('professorsOfEdition es la misma regla de los profesores', () => {
    expect(professorsOfEdition(7)).toEqual({
      isActive: true,
      role: { name: 'Profesor' },
      managedNrcs: { some: { editionId: 7, isActive: true } },
    });
  });
});
