import {
  editionPeriodLabel,
  editionPeriodSlug,
  semesterLabel,
} from './semester-label';

describe('semester-label (BG-63)', () => {
  it.each([
    [10, '1'],
    [20, 'Intersemestral'],
    [30, '2'],
    [40, '40'],
  ])('semesterLabel(%i) = %s', (semester, label) => {
    expect(semesterLabel(semester)).toBe(label);
  });

  it.each([
    [10, '2026 - 1', '2026-1'],
    [20, '2026 - Intersemestral', '2026-intersemestral'],
    [30, '2026 - 2', '2026-2'],
    [40, '2026 - 40', '2026-40'],
  ])(
    'semestre %i: etiqueta %s y nombre de archivo %s',
    (semester, label, slug) => {
      expect(editionPeriodLabel({ year: 2026, semester })).toBe(label);
      expect(editionPeriodSlug({ year: 2026, semester })).toBe(slug);
    },
  );
});
