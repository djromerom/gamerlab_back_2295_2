import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { PassThrough } from 'stream';
import {
  ExcelExportOptions,
  ExcelExportService,
  GRADE_NUM_FMT,
  GroupRow,
  gradeCellValue,
} from './excel-export.service';

// BG-36: las notas del Excel del panel del profesor salen como números con 2 decimales.

describe('gradeCellValue', () => {
  it.each([
    [4, 4],
    [3.5, 3.5],
    [3.456, 3.46],
    [4.444, 4.44],
    [0, 0],
  ])(
    '%p ⇒ %p (número, redondeado como en las pantallas)',
    (input, expected) => {
      expect(gradeCellValue(input)).toBe(expected);
    },
  );

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    '%p ⇒ null (celda vacía)',
    (input) => {
      expect(gradeCellValue(input)).toBeNull();
    },
  );
});

/** Respuesta falsa que guarda el archivo generado en memoria. */
function fakeResponse() {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    stream.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const res = Object.assign(stream, { setHeader: jest.fn() });
  return { res: res as unknown as Response, done };
}

const row = (videogameId: number, teamCode: string): GroupRow => ({
  teamCode,
  teamName: `Equipo ${teamCode}`,
  videogameName: `Juego ${teamCode}`,
  videogameId,
  nrcCodes: new Set(['2501']),
  members: new Set(['Ana Pérez']),
  grade: null,
  hasNRC: true,
});

// Notas de prueba del ticket: entera, con un decimal y con más de dos; 4 no tiene nota.
const SCORES: Record<number, number | null> = {
  1: 4,
  2: 3.5,
  3: 3.456,
  4: null,
};

async function generate(final: boolean) {
  const options: ExcelExportOptions = {
    final,
    professorId: 'prof-1',
    fileName: 'calificaciones.xlsx',
    sheets: [
      {
        sheetName: 'POO-2501',
        subjectName: 'Programación Orientada a Objetos',
        nrcCode: '2501',
        editionLabel: 'Feria 2026-2 (2026-30)',
        groups: new Map([1, 2, 3, 4].map((id) => [id, row(id, `T-${id}`)])),
      },
    ],
    getFeriaScore: (id) => Promise.resolve(SCORES[id]),
    getJuniorScore: (id) => Promise.resolve(SCORES[id]),
    getDocenteScore: (id) => Promise.resolve(SCORES[id]),
    resolveVideogameId: () => Promise.resolve(null),
  };
  const { res, done } = fakeResponse();
  await new ExcelExportService().generateAndStream(options, res);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await done);
  const ws = wb.worksheets[0];
  // Fila 1: título, 2: vacía, 3: encabezados, 4..7: equipos
  const headers = (ws.getRow(3).values as unknown[]).slice(1) as string[];
  const cellsOf = (header: string) => {
    const col = headers.indexOf(header) + 1;
    expect(col).toBeGreaterThan(0);
    return [4, 5, 6, 7].map((r) => ws.getRow(r).getCell(col));
  };
  return { cellsOf };
}

describe('ExcelExportService: notas con 2 decimales (BG-36)', () => {
  it('reporte normal: Calificación Docente como número con formato 0.00', async () => {
    const { cellsOf } = await generate(false);
    const cells = cellsOf('Calificación Docente');
    expect(cells.map((c) => c.value)).toEqual([4, 3.5, 3.46, null]);
    for (const c of cells.slice(0, 3)) {
      expect(typeof c.value).toBe('number');
      expect(c.numFmt).toBe(GRADE_NUM_FMT);
    }
  });

  it('reporte final: Feria, Jurado Junior y Docente como números con formato 0.00', async () => {
    const { cellsOf } = await generate(true);
    for (const header of [
      'Calificación Feria',
      'Calificación Jurado Junior',
      'Calificación Docente',
    ]) {
      const cells = cellsOf(header);
      expect(cells.map((c) => c.value)).toEqual([4, 3.5, 3.46, null]);
      for (const c of cells) expect(c.numFmt).toBe(GRADE_NUM_FMT);
    }
  });
});
