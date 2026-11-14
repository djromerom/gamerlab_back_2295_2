import * as ExcelJS from 'exceljs';
import { bogotaDate } from 'src/reports/juror-assignment-export';
import { FieldSummary, SURVEY_FIELDS } from './survey-rules';
import { SurveyResponseRow, SurveySummary } from './juror-survey.service';

/**
 * HU-17 (ARK-183): Excel de la encuesta de experiencia para el administrador.
 * Hoja «Respuestas» (una fila por jurado) y hoja «Resumen» (promedio y distribución por campo).
 */

/** `encuesta_jurados_<año>-<semestre>_<fecha>.xlsx`, como los demás reportes. */
export function buildSurveyFileName(
  edition: { year: number; semester: number },
  date: Date = new Date(),
): string {
  return `encuesta_jurados_${edition.year}-${edition.semester}_${bogotaDate(date)}.xlsx`;
}

/** Fecha y hora de Colombia, `YYYY-MM-DD HH:mm`. */
export function bogotaDateTime(date: Date): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${bogotaDate(date)} ${time}`;
}

function styleHeader(sheet: ExcelJS.Worksheet, columns: number) {
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD6EAF8' },
    };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns },
  };
}

export function buildSurveyWorkbook(
  rows: SurveyResponseRow[],
  summary: Pick<SurveySummary, 'edition' | 'totals'> & {
    fields: FieldSummary[];
  },
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `Encuesta de jurados · ${summary.edition.title}`;

  const answers = workbook.addWorksheet('Respuestas');
  answers.columns = [
    { header: 'Jurado', key: 'jurorName', width: 30 },
    { header: 'Correo', key: 'email', width: 32 },
    { header: 'Rol', key: 'role', width: 12 },
    ...SURVEY_FIELDS.map(({ key, label }) => ({
      header: label,
      key,
      width: 18,
    })),
    { header: 'Comentarios y sugerencias', key: 'comments', width: 60 },
    { header: 'Fecha', key: 'createdAt', width: 18 },
  ];
  for (const row of rows) {
    answers.addRow({
      ...row,
      comments: row.comments ?? '',
      createdAt: bogotaDateTime(row.createdAt),
    });
  }
  answers.getColumn('comments').alignment = { wrapText: true, vertical: 'top' };
  styleHeader(answers, answers.columns.length);

  const resume = workbook.addWorksheet('Resumen');
  resume.columns = [
    { header: 'Campo', key: 'label', width: 58 },
    { header: 'Promedio', key: 'average', width: 11 },
    ...(['1', '2', '3', '4', '5'] as const).map((n) => ({
      header: `Nota ${n}`,
      key: `n${n}`,
      width: 9,
    })),
  ];
  for (const field of summary.fields) {
    resume.addRow({
      label: field.label,
      average: field.average ?? '',
      ...Object.fromEntries(
        Object.entries(field.distribution).map(([n, c]) => [`n${n}`, c]),
      ),
    });
  }
  resume.addRow({});
  resume.addRow({
    label: 'Respuestas recibidas',
    average: summary.totals.responses,
  });
  resume.addRow({
    label: 'Jurados que terminaron de evaluar',
    average: summary.totals.jurorsFinished,
  });
  resume.addRow({
    label: 'Jurados de la edición',
    average: summary.totals.editionJurors,
  });
  styleHeader(resume, resume.columns.length);
  return workbook;
}
