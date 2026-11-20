import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * ARK-130 (HU-27): regresión estática. La edición de trabajo sale de un solo lugar
 * (`src/editions/active-edition.ts`). Esta prueba falla si un servicio vuelve a:
 * - filtrar la edición activa a mano (`status: EditionStatus.ACTIVE` / `status: 'ACTIVE'`), o
 * - tomar «la edición con el id más alto» (`edition.findFirst` sin `where`, solo con `orderBy`).
 * Si un caso nuevo es legítimo (p. ej. el que activa una edición), agrégalo a ALLOWED con el motivo.
 */
const SRC = join(__dirname, '..');

const ALLOWED: Record<string, string> = {
  'editions/active-edition.ts': 'la fuente única',
  'editions/editions.service.ts':
    'activar una edición escribe el estado ACTIVE',
  'jurors/absence-alert/absence-alert.controller.ts': 'ejemplo de Swagger',
  'jurors/juror-edition/juror-edition.controller.ts': 'ejemplo de Swagger',
  'students/students.controller.ts': 'ejemplo de Swagger',
  'professors/professors.swagger-examples.ts': 'ejemplo de Swagger',
  'jurors/juror/automatic-assignment/automatic-assignment.swagger.ts':
    'ejemplo de Swagger',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  rel: relative(SRC, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('Edición activa: una sola fuente (HU-27)', () => {
  it('nadie filtra la edición activa a mano fuera de active-edition.ts', () => {
    const offenders = files
      .filter(({ rel }) => !ALLOWED[rel])
      .filter(({ text }) =>
        /status:\s*(EditionStatus\.ACTIVE|['"]ACTIVE['"])/.test(text),
      )
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('nadie toma «la edición con el id más alto» como edición de trabajo', () => {
    const highestId =
      /edition\.findFirst\(\{\s*orderBy:\s*\{\s*id:\s*'desc'\s*\}/;
    const offenders = files
      .filter(({ text }) => highestId.test(text))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });

  it('la lista de excepciones no tiene entradas viejas', () => {
    const existing = new Set(files.map(({ rel }) => rel));
    expect(Object.keys(ALLOWED).filter((rel) => !existing.has(rel))).toEqual(
      [],
    );
  });

  // Decisión del 2026-11-04 (Scrum, revisión del PR): la información de la edición se edita en
  // cualquier edición; solo los datos de la feria (equipos, NRC, jurados...) son de solo lectura.
  it.each([
    'editions/editions.service.ts',
    'testimonials/testimonials.service.ts',
    'highlighted-games/highlighted-games.service.ts',
    'educational-focuses/educational-focuses.service.ts',
  ])(
    '%s (información de la edición) no usa las guardas de escritura',
    (rel) => {
      const file = files.find((f) => f.rel === rel);
      expect(file).toBeDefined();
      expect(file!.text).not.toMatch(/assert\w*Writable/);
    },
  );
});
