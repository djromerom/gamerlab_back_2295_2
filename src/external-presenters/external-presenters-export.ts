import * as ExcelJS from 'exceljs';
import { bogotaDate } from '../reports/juror-assignment-export';
import { ExternalPresenterView } from './external-presenters.service';
import { PresenterTeamView } from './external-presenter-teams';

/** HU-33 (ARK-194): Excel de los presentadores externos de una edición. */
export function buildExternalPresentersFileName(
  edition: { year: number; semester: number },
  date: Date = new Date(),
): string {
  return `presentadores_externos_${edition.year}-${edition.semester}_${bogotaDate(date)}.xlsx`;
}

export const EXTERNAL_PRESENTER_COLUMNS = [
  { header: 'Nombre', key: 'firstName', width: 22 },
  { header: 'Apellido', key: 'lastName', width: 22 },
  { header: 'Correo', key: 'email', width: 32 },
  { header: 'Organización', key: 'organization', width: 30 },
  { header: 'Título de la presentación', key: 'presentationTitle', width: 45 },
  { header: 'Entró a ARKAD', key: 'signedIn', width: 14 },
  { header: 'Certificado enviado', key: 'certificateSent', width: 18 },
] as const;

/** HU-39 (ARK-209): hoja de los equipos presentadores externos, una fila por integrante. */
export const PRESENTER_TEAM_COLUMNS = [
  { header: 'Código del equipo', key: 'teamCode', width: 16 },
  { header: 'Equipo', key: 'teamName', width: 28 },
  { header: 'Proyecto', key: 'projectTitle', width: 36 },
  { header: 'Nombre', key: 'firstName', width: 22 },
  { header: 'Apellido', key: 'lastName', width: 22 },
  { header: 'Correo', key: 'email', width: 32 },
  { header: 'Certificado enviado', key: 'certificateSent', width: 18 },
] as const;

export function buildExternalPresentersWorkbook(
  presenters: ExternalPresenterView[],
  editionTitle: string,
  teams: PresenterTeamView[] = [],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `Presentadores externos · ${editionTitle}`;
  const sheet = workbook.addWorksheet('Presentadores externos');
  sheet.columns = EXTERNAL_PRESENTER_COLUMNS.map((c) => ({ ...c }));
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD6EAF8' },
    };
  });
  for (const p of presenters) {
    sheet.addRow({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      organization: p.organization ?? '',
      presentationTitle: p.presentationTitle ?? '',
      signedIn: p.lastSignInAt ? 'Sí' : 'No',
      certificateSent: p.certificateSentAt
        ? bogotaDate(p.certificateSentAt)
        : 'No',
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXTERNAL_PRESENTER_COLUMNS.length },
  };

  const teamSheet = workbook.addWorksheet('Equipos presentadores');
  teamSheet.columns = PRESENTER_TEAM_COLUMNS.map((c) => ({ ...c }));
  teamSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };
  });
  for (const team of teams) {
    const base = {
      teamCode: team.teamCode,
      teamName: team.teamName,
      projectTitle: team.projectTitle ?? '',
      certificateSent: team.certificateSentAt
        ? bogotaDate(team.certificateSentAt)
        : 'No',
    };
    if (team.members.length === 0) teamSheet.addRow(base);
    for (const member of team.members) {
      teamSheet.addRow({ ...base, ...member });
    }
  }
  teamSheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
}
