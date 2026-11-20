import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { MAX_IMPORT_ROWS } from './juror-edition-import.logic';
import {
  buildImportTemplate,
  cellText,
  readImportRows,
  TEMPLATE_HEADERS,
} from './juror-edition-import.xlsx';

async function workbookBuffer(
  rows: ExcelJS.CellValue[][],
  sheetName = 'Jurados',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Generar y leer xlsx con exceljs es lento cuando la suite corre en paralelo.
jest.setTimeout(30_000);

const HEADERS = ['Nombres', 'Apellidos', 'Correo', 'Tipo'];

describe('HU-49: lector del xlsx', () => {
  it('lee las filas con su número de fila de Excel', async () => {
    const buffer = await workbookBuffer([
      HEADERS,
      ['Ana', 'Pérez', 'ana@x.com', 'Oficial'],
      ['Luis', 'Gómez', 'luis@x.com', 'Suplente'],
    ]);
    expect(await readImportRows(buffer)).toEqual([
      {
        row: 2,
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@x.com',
        type: 'Oficial',
      },
      {
        row: 3,
        firstName: 'Luis',
        lastName: 'Gómez',
        email: 'luis@x.com',
        type: 'Suplente',
      },
    ]);
  });

  it('salta las filas vacías pero conserva la numeración', async () => {
    const buffer = await workbookBuffer([
      HEADERS,
      ['Ana', 'Pérez', 'ana@x.com', ''],
      [],
      [null, null, null, null],
      ['Luis', 'Gómez', 'luis@x.com'],
    ]);
    const rows = await readImportRows(buffer);
    expect(rows.map((row) => row.row)).toEqual([2, 5]);
    expect(rows[1].type).toBe('');
  });

  it('acepta los encabezados con otro orden, tildes, mayúsculas y singulares', async () => {
    const buffer = await workbookBuffer([
      ['TIPO', 'Correo Electrónico', 'apellido', 'NOMBRE'],
      ['Suplente', 'ana@x.com', 'Pérez', 'Ana'],
    ]);
    expect(await readImportRows(buffer)).toEqual([
      {
        row: 2,
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@x.com',
        type: 'Suplente',
      },
    ]);
  });

  it('lee el correo aunque Excel lo haya convertido en hipervínculo o fórmula', async () => {
    const buffer = await workbookBuffer([
      HEADERS,
      [
        'Ana',
        'Pérez',
        { text: 'ana@x.com', hyperlink: 'mailto:ana@x.com' },
        null,
      ],
      ['Luis', 'Gómez', { formula: 'A1', result: 'luis@x.com' }, null],
    ]);
    const rows = await readImportRows(buffer);
    expect(rows.map((row) => row.email)).toEqual(['ana@x.com', 'luis@x.com']);
  });

  it('lee solo la primera hoja', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Jurados').addRows([HEADERS, ['A', 'B', 'a@x.com']]);
    workbook.addWorksheet('Otra').addRows([HEADERS, ['C', 'D', 'c@x.com']]);
    const rows = await readImportRows(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    expect(rows.map((row) => row.email)).toEqual(['a@x.com']);
  });

  it('rechaza un archivo que no es xlsx', async () => {
    await expect(
      readImportRows(Buffer.from('nombres,apellidos,correo,tipo\n')),
    ).rejects.toThrow('no es un Excel');
  });

  it('rechaza un zip que no es un Excel', async () => {
    await expect(
      readImportRows(Buffer.from('PK\u0003\u0004 basura')),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([
    [['Nombres', 'Apellidos', 'Tipo']],
    [['Nombres', 'Correo', 'Tipo']],
    [['Name', 'Last', 'Mail', 'Type']],
  ])('rechaza si faltan columnas de la plantilla (%j)', async (headers) => {
    const buffer = await workbookBuffer([headers, ['Ana', 'Pérez', 'a@x.com']]);
    await expect(readImportRows(buffer)).rejects.toThrow(
      'no sigue la plantilla',
    );
  });

  it('rechaza un archivo sin filas con datos', async () => {
    await expect(
      readImportRows(await workbookBuffer([HEADERS])),
    ).rejects.toThrow('no tiene filas con datos');
  });

  it(`rechaza más de ${MAX_IMPORT_ROWS} filas con datos`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => [
      'Ana',
      'Pérez',
      `ana${index}@x.com`,
      '',
    ]);
    await expect(
      readImportRows(await workbookBuffer([HEADERS, ...rows])),
    ).rejects.toThrow(`más de ${MAX_IMPORT_ROWS} filas`);
  });

  it(`acepta exactamente ${MAX_IMPORT_ROWS} filas`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, index) => [
      'Ana',
      'Pérez',
      `ana${index}@x.com`,
      '',
    ]);
    expect(
      await readImportRows(await workbookBuffer([HEADERS, ...rows])),
    ).toHaveLength(MAX_IMPORT_ROWS);
  });
});

describe('HU-49: cellText', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['  hola ', '  hola '],
    [42, '42'],
    [{ richText: [{ text: 'a@' }, { text: 'x.com' }] }, 'a@x.com'],
    [{ hyperlink: 'mailto:ana@x.com' }, 'ana@x.com'],
  ])('%j → %j', (value, expected) => {
    expect(cellText(value as ExcelJS.CellValue | undefined)).toBe(expected);
  });
});

describe('HU-49: plantilla', () => {
  it('trae los encabezados Nombres, Apellidos, Correo y Tipo y una hoja de instrucciones', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await buildImportTemplate()) as unknown as ArrayBuffer,
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Jurados',
      'Instrucciones',
    ]);
    const headers = (workbook.getWorksheet('Jurados')?.getRow(1).values ??
      []) as unknown[];
    expect(headers.slice(1)).toEqual(TEMPLATE_HEADERS);
  });

  it('la plantilla vacía sigue la plantilla (no falla por columnas) y se rechaza por estar vacía', async () => {
    await expect(readImportRows(await buildImportTemplate())).rejects.toThrow(
      'no tiene filas con datos',
    );
  });
});
