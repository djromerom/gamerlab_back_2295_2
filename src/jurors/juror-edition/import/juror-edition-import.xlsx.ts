import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { foldText, MAX_IMPORT_ROWS } from './juror-edition-import.logic';
import { RawImportRow } from './juror-edition-import.types';

/** Encabezados de la plantilla, en este orden. */
export const TEMPLATE_HEADERS = ['Nombres', 'Apellidos', 'Correo', 'Tipo'];

type Column = 'firstName' | 'lastName' | 'email' | 'type';

// Encabezado (sin tildes ni mayúsculas) → columna. Se aceptan los singulares por comodidad.
const HEADER_ALIASES: Record<string, Column> = {
  nombres: 'firstName',
  nombre: 'firstName',
  apellidos: 'lastName',
  apellido: 'lastName',
  correo: 'email',
  'correo electronico': 'email',
  email: 'email',
  tipo: 'type',
};

const REQUIRED_COLUMNS: Column[] = ['firstName', 'lastName', 'email', 'type'];

/** Texto de una celda: las direcciones de correo suelen llegar como hipervínculo o fórmula. */
export function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('text' in value) return cellText(value.text as ExcelJS.CellValue);
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  if ('hyperlink' in value) {
    return String(value.hyperlink).replace(/^mailto:/i, '');
  }
  return '';
}

async function loadWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // Un xlsx es un zip: «PK». Se revisa antes de cargarlo para dar un mensaje claro.
  if (buffer.length < 4 || buffer.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new BadRequestException(
      'El archivo no es un Excel (.xlsx). Descargue la plantilla y úsela.',
    );
  }
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException(
      'No se pudo leer el archivo. Verifique que sea un Excel (.xlsx) válido.',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('El archivo no tiene ninguna hoja.');
  }
  return sheet;
}

function mapColumns(sheet: ExcelJS.Worksheet): Record<Column, number> {
  const found: Partial<Record<Column, number>> = {};
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const column = HEADER_ALIASES[foldText(cellText(cell.value))];
    if (column && found[column] === undefined) found[column] = columnNumber;
  });
  const missing = REQUIRED_COLUMNS.filter((column) => !found[column]);
  if (missing.length) {
    throw new BadRequestException(
      `El archivo no sigue la plantilla: la primera fila debe tener las columnas ${TEMPLATE_HEADERS.join(', ')}.`,
    );
  }
  return found as Record<Column, number>;
}

/**
 * Lee la primera hoja con las columnas de la plantilla. Rechaza el archivo completo (400) si no
 * es un xlsx, si faltan columnas o si tiene más de `MAX_IMPORT_ROWS` filas con datos. Las filas
 * totalmente vacías se saltan.
 */
export async function readImportRows(buffer: Buffer): Promise<RawImportRow[]> {
  const sheet = await loadWorksheet(buffer);
  const columns = mapColumns(sheet);

  const rows: RawImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    const raw: RawImportRow = {
      row: rowNumber,
      firstName: cellText(excelRow.getCell(columns.firstName).value),
      lastName: cellText(excelRow.getCell(columns.lastName).value),
      email: cellText(excelRow.getCell(columns.email).value),
      type: cellText(excelRow.getCell(columns.type).value),
    };
    const empty = [raw.firstName, raw.lastName, raw.email, raw.type].every(
      (value) => value.trim() === '',
    );
    if (empty) continue;
    rows.push(raw);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Divídalo en varios archivos.`,
      );
    }
  }
  if (rows.length === 0) {
    throw new BadRequestException('El archivo no tiene filas con datos.');
  }
  return rows;
}

/** Plantilla vacía: solo encabezados (una fila de ejemplo se importaría si se deja). */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Jurados');
  sheet.columns = [
    { header: TEMPLATE_HEADERS[0], key: 'firstName', width: 28 },
    { header: TEMPLATE_HEADERS[1], key: 'lastName', width: 28 },
    { header: TEMPLATE_HEADERS[2], key: 'email', width: 38 },
    { header: TEMPLATE_HEADERS[3], key: 'type', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  // Lista desplegable en la columna Tipo (filas 2 a 501).
  for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
    sheet.getCell(row, 4).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Oficial,Suplente"'],
    };
  }

  const help = workbook.addWorksheet('Instrucciones');
  help.getColumn(1).width = 90;
  [
    'Llene la hoja «Jurados»: una fila por jurado, empezando en la fila 2.',
    'Nombres, Apellidos y Correo son obligatorios.',
    'Tipo: Oficial o Suplente. Si se deja vacío, queda Oficial.',
    `Máximo ${MAX_IMPORT_ROWS} filas por archivo.`,
    'Todos los jurados de la lista quedan confirmados en la edición activa.',
    'Si el correo no tiene cuenta, se crea y se le envía un correo para crear su contraseña.',
  ].forEach((line) => help.addRow([line]));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
