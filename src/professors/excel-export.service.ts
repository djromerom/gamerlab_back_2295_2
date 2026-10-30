import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

// ─── Palette ────────────────────────────────────────────────────────────────
const COLORS: Record<string, string> = {
  headerBg:     'FF1F3864',
  headerFg:     'FFFFFFFF',
  docenteBg:    'FFC6EFCE',
  feriaBg:      'FFE5D5FA',
  juniorBg:     'FFD6EAF8',
  groupTitleBg: 'FF2E5FAD',
  groupTitleFg: 'FFFFFFFF',
  altRowBg:     'FFF5F8FF',
  borderColor:  'FFBDC3C7',
};

const BRAND_NAME = 'ARKAD';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface GroupRow {
  teamCode:      string;
  teamName:      string;
  videogameName: string;
  videogameId:   number | null;
  nrcCodes:      Set<string>;
  members:       Set<string>;
  grade:         number | null;
  hasNRC:        boolean;
}

export interface NrcSheetData {
  sheetName:   string;
  subjectName: string;
  nrcCode:     string;
  groups:      Map<string | number, GroupRow>;
  // Si alguna hoja lo trae, se agrega la columna "Feria" (HU-02)
  editionLabel?: string;
}

export interface ExcelExportOptions {
  final:       boolean;
  professorId: string;
  fileName:    string;
  sheets:      NrcSheetData[];
  // Resolver functions injected from service to keep this class stateless
  getFeriaScore:  (videogameId: number) => Promise<number | null>;
  getJuniorScore: (videogameId: number) => Promise<number | null>;
  getDocenteScore: (videogameId: number, professorId: string) => Promise<number | null>;
  resolveVideogameId: (teamCode: string, videogameName: string) => Promise<number | null>;
}

@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  // ── Public entry point ────────────────────────────────────────────────────

  async generateAndStream(options: ExcelExportOptions, res: Response): Promise<void> {
    const { fileName, sheets, final } = options;
    const withEdition = sheets.some((s) => s.editionLabel !== undefined);

    try {
      const workbook = this.createWorkbook();

      for (const sheet of sheets) {
        const worksheet = workbook.addWorksheet(sheet.sheetName);
        this.addGroupHeader(worksheet, sheet.subjectName, sheet.nrcCode, sheet.editionLabel);
        const columnKeys = this.getColumnKeys(final, withEdition);
        const headers    = this.getHeaders(final, withEdition);
        worksheet.columns = columnKeys.map((k) => ({ key: k }));
        const maxLens = this.addStyledHeader(worksheet, headers, final);
        await this.addDataRows(worksheet, sheet, options, columnKeys, maxLens);
        this.applyColumnSizing(worksheet, columnKeys, maxLens);
        this.addFooter(worksheet, columnKeys.length);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', ExcelExportService.buildContentDisposition(fileName));
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      const msg = (error as any)?.message ?? 'Error generando el archivo Excel';
      this.logger.error(`Excel generation error: ${msg}`, (error as any)?.stack);
      throw new InternalServerErrorException(
        'No se pudo generar el archivo Excel. Intenta de nuevo o contacta al administrador.',
      );
    }
  }

  // ── Workbook setup ────────────────────────────────────────────────────────

  private createWorkbook(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator   = BRAND_NAME;
    wb.company   = BRAND_NAME;
    wb.created   = new Date();
    wb.modified  = new Date();
    return wb;
  }

  // ── Sheet title block (Materia + NRC) ────────────────────────────────────

  private addGroupHeader(worksheet: ExcelJS.Worksheet, subjectName: string, nrcCode: string, editionLabel?: string) {
    const parts = [subjectName, `NRC ${nrcCode}`, ...(editionLabel ? [editionLabel] : [])];
    const titleRow = worksheet.addRow([parts.join('  ·  ')]);
    titleRow.height = 22;
    titleRow.eachCell((cell) => {
      cell.font = { bold: true, size: 13, color: { argb: COLORS.groupTitleFg } } as any;
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: COLORS.groupTitleBg },
      } as any;
      cell.alignment = { horizontal: 'left', vertical: 'middle' } as any;
    });
    worksheet.addRow([]); // blank row for breathing room
  }

  // ── Column definitions ────────────────────────────────────────────────────

  private getColumnKeys(final: boolean, withEdition = false): string[] {
    const base = ['teamCode', 'subject', 'nrc', ...(withEdition ? ['edition'] : []), 'team', 'members', 'videogame'];
    return final ? [...base, 'feriaScore', 'juniorScore', 'docenteScore'] : [...base, 'score'];
  }

  private getHeaders(final: boolean, withEdition = false): string[] {
    const base = ['Código de Equipo', 'Materia', 'NRC', ...(withEdition ? ['Feria'] : []), 'Equipo', 'Integrantes', 'Videojuego'];
    return final
      ? [...base, 'Calificación Feria', 'Calificación Jurado Junior', 'Calificación Docente']
      : [...base, 'Calificación Docente'];
  }

  // ── Header row styling ────────────────────────────────────────────────────

  private addStyledHeader(worksheet: ExcelJS.Worksheet, headers: string[], final: boolean): number[] {
    const maxLens = headers.map((h) => h.length);
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 28;

    const scoreIdx  = headers.indexOf('Calificación Docente');
    const feriaIdx  = headers.indexOf('Calificación Feria');
    const juniorIdx = headers.indexOf('Calificación Jurado Junior');

    headerRow.eachCell((cell, colNumber) => {
      const idx = colNumber - 1;
      const isScore  = idx === scoreIdx;
      const isFeria  = idx === feriaIdx;
      const isJunior = idx === juniorIdx;

      let bgColor = COLORS.headerBg;
      if (isScore)  bgColor = COLORS.docenteBg;
      if (isFeria)  bgColor = COLORS.feriaBg;
      if (isJunior) bgColor = COLORS.juniorBg;

      const fgColor = (isScore || isFeria || isJunior) ? '00000000' : COLORS.headerFg;

      cell.font      = { bold: true, size: 11, color: { argb: fgColor } } as any;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } } as any;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } as any;
      cell.border    = this.thinBorder();

      const len = String(cell.value ?? '').length;
      if (len > maxLens[idx]) maxLens[idx] = len;
    });

    // Freeze header row so it stays visible when scrolling
    worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

    return maxLens;
  }

  // ── Data rows ─────────────────────────────────────────────────────────────

  private async addDataRows(
    worksheet: ExcelJS.Worksheet,
    sheet: NrcSheetData,
    options: ExcelExportOptions,
    columnKeys: string[],
    maxLens: number[],
  ) {
    const { final, professorId, getFeriaScore, getJuniorScore, getDocenteScore, resolveVideogameId } = options;
    let rowIndex = 0;
    let anyRow = false;

    for (const [, g] of sheet.groups) {
      if (!g.hasNRC) continue;
      anyRow = true;

      // Resolve scores
      let docenteScore = '';
      let feriaScore   = '';
      let juniorScore  = '';

      try {
        let vgId = g.videogameId ? Number(g.videogameId) : null;
        if (!vgId) {
          vgId = await resolveVideogameId(g.teamCode, g.videogameName);
          if (vgId) g.videogameId = vgId;
        }

        if (vgId) {
          const ds = await getDocenteScore(vgId, professorId);
          if (ds !== null) {
            docenteScore = ds.toFixed(1);
            g.grade = ds;
          }
          if (final) {
            const fs = await getFeriaScore(vgId);
            if (fs !== null) feriaScore = fs.toFixed(1);
            const js = await getJuniorScore(vgId);
            if (js !== null) juniorScore = js.toFixed(1);
          }
        }
      } catch (err) {
        this.logger.warn(`Score resolution error for team ${g.teamCode}: ${(err as any)?.message}`);
      }

      const rowObj: Record<string, any> = {
        teamCode:  g.teamCode ?? '',
        subject:   sheet.subjectName,
        nrc:       sheet.nrcCode,
        edition:   sheet.editionLabel ?? '',
        team:      g.teamName,
        members:   Array.from(g.members).join('\n'),
        videogame: g.videogameName,
      };

      if (final) {
        rowObj.feriaScore   = feriaScore;
        rowObj.juniorScore  = juniorScore;
        rowObj.docenteScore = docenteScore;
      } else {
        rowObj.score = g.grade !== null ? g.grade.toFixed(1) : '';
      }

      const dataRow = worksheet.addRow(rowObj);

      // Alternate row background
      if (rowIndex % 2 === 1) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.altRowBg } } as any;
        });
      }

      // Style score cells
      const scoreKeys = final
        ? ['feriaScore', 'juniorScore', 'docenteScore']
        : ['score'];
      const scoreColors = final
        ? [COLORS.feriaBg, COLORS.juniorBg, COLORS.docenteBg]
        : [COLORS.docenteBg];

      scoreKeys.forEach((key, i) => {
        const colIdx = columnKeys.indexOf(key);
        if (colIdx >= 0) {
          const cell = dataRow.getCell(colIdx + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: scoreColors[i] } } as any;
          cell.font = { bold: true } as any;
          cell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
        }
      });

      // Borders and member cell wrap
      dataRow.eachCell((cell, colNumber) => {
        cell.border = this.thinBorder();
        if (columnKeys[colNumber - 1] === 'members') {
          cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' } as any;
          // Auto-height hint: one line per member
          const lines = Array.from(g.members).length;
          dataRow.height = Math.max(20, lines * 16);
        }
      });

      // Update max lengths for column sizing
      columnKeys.forEach((k, i) => {
        const v = String(rowObj[k] ?? '');
        // For members, use the longest single name (not joined)
        const len = k === 'members'
          ? Math.max(...Array.from(g.members).map((m) => m.length), 0)
          : v.length;
        if (len > maxLens[i]) maxLens[i] = len;
      });

      rowIndex++;
    }

    if (!anyRow) {
      const emptyRow: Record<string, any> = {
        teamCode: '', subject: sheet.subjectName, nrc: sheet.nrcCode, edition: sheet.editionLabel ?? '',
        team: 'Sin equipos registrados', members: '', videogame: '',
      };
      if (final) {
        emptyRow.feriaScore = ''; emptyRow.juniorScore = ''; emptyRow.docenteScore = '';
      } else {
        emptyRow.score = '';
      }
      const row = worksheet.addRow(emptyRow);
      row.eachCell((cell) => {
        cell.font = { italic: true, color: { argb: 'FF999999' } } as any;
        cell.alignment = { horizontal: 'center' } as any;
      });
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  private addFooter(worksheet: ExcelJS.Worksheet, colCount: number) {
    worksheet.addRow([]);
    const footerRow = worksheet.addRow([
      `Generado por ${BRAND_NAME} · ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    ]);
    footerRow.eachCell((cell) => {
      cell.font      = { italic: true, size: 9, color: { argb: 'FF888888' } } as any;
      cell.alignment = { horizontal: 'left' } as any;
    });
  }

  // ── Column sizing ─────────────────────────────────────────────────────────

  private applyColumnSizing(worksheet: ExcelJS.Worksheet, columnKeys: string[], maxLens: number[]) {
    worksheet.columns.forEach((col, idx) => {
      const min = columnKeys[idx] === 'members' ? 30 : 12;
      const max = columnKeys[idx] === 'members' ? 45 : 35;
      col.width = Math.min(Math.max(maxLens[idx] + 3, min), max);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private thinBorder(): Partial<ExcelJS.Borders> {
    const side = { style: 'thin' as const, color: { argb: COLORS.borderColor } };
    return { top: side, left: side, bottom: side, right: side };
  }

  // ── Content-Disposition (static, reusable) ────────────────────────────────

  /** `filename` ASCII de respaldo + `filename*` UTF-8 (RFC 5987) para tildes. */
  static buildContentDisposition(fileName: string): string {
    const ascii = fileName
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  // ── Sheet name builder (static, reusable) ─────────────────────────────────

  static buildSheetName(prefix: string, nrcCode: string | number, usedNames: Set<string>): string {
    let base = `${prefix}-${nrcCode}`;
    if (base.length > 31) base = base.substring(0, 31);

    let name = base;
    let counter = 1;
    while (usedNames.has(name)) {
      const suffix  = `_${counter++}`;
      const trimmed = base.substring(0, Math.max(0, 31 - suffix.length));
      name = `${trimmed}${suffix}`;
    }
    usedNames.add(name);
    return name;
  }

  // ── Subject sigla builder (static, reusable) ──────────────────────────────

  static buildSubjectPrefix(subjectName: string): string {
    const SIGLAS_MAP: Record<string, string> = {
      'algoritmia y programacion 1': 'AYP1',
      'algoritmia y programacion 2': 'AYP2',
      'estructura de datos 1':       'EDD1',
      'estructura de datos 2':       'EDD2',
      'programacion orientada a objetos': 'POO',
    };

    const normalized = subjectName
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x)\b$/i, (m) => {
        const map: Record<string, string> = {
          i:'1', ii:'2', iii:'3', iv:'4', v:'5', vi:'6', vii:'7', viii:'8', ix:'9', x:'10',
        };
        return map[m.toLowerCase()] ?? m;
      });

    if (SIGLAS_MAP[normalized]) return SIGLAS_MAP[normalized];

    const words       = subjectName.match(/[A-Za-z0-9]+/g) || [subjectName];
    const initials    = words.map((w) => w[0]).join('').toUpperCase();
    const digitMatch  = (normalized.match(/(\d+)/g) || []).pop();
    const digit       = digitMatch ? digitMatch.trim().charAt(0) : '';
    return (initials.substring(0, 3) + digit).substring(0, 4) ||
      subjectName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
}
