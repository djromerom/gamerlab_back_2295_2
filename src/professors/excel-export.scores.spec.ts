import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { ExcelExportService, ExcelExportOptions } from './excel-export.service';

/** HU-34 / P-04: las notas del Excel van con 2 decimales, las mismas del ranking. */
describe('ExcelExportService: notas', () => {
  const run = async (feria: number | null) => {
    const stream = new PassThrough();
    const res = Object.assign(stream, {
      setHeader: jest.fn(),
    }) as unknown as Response;
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));

    const options: ExcelExportOptions = {
      final: true,
      professorId: 'p1',
      fileName: 'x.xlsx',
      sheets: [
        {
          sheetName: 'NRC 1',
          subjectName: 'Materia',
          nrcCode: '1',
          groups: new Map([
            [
              'T',
              {
                teamCode: 'N1-T',
                teamName: 'Equipo',
                videogameName: 'Juego',
                videogameId: 7,
                nrcCodes: new Set(['1']),
                members: new Set(['Ana']),
                grade: null,
                hasNRC: true,
              },
            ],
          ]),
        },
      ],
      getFeriaScore: () => Promise.resolve(feria),
      getJuniorScore: () => Promise.resolve(3.25),
      getDocenteScore: () => Promise.resolve(4.5),
      resolveVideogameId: () => Promise.resolve(7),
    };
    await new ExcelExportService().generateAndStream(options, res);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks) as any);
    const rows: unknown[][] = [];
    workbook.worksheets[0].eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1));
    });
    const header = rows.findIndex((r) => r.includes('Calificación Feria'));
    const at = (name: string) => rows[header + 1][rows[header].indexOf(name)];
    return {
      feria: at('Calificación Feria'),
      junior: at('Calificación Jurado Junior'),
      docente: at('Calificación Docente'),
    };
  };

  it('con 2 decimales', async () => {
    await expect(run(4.25)).resolves.toEqual({
      feria: '4.25',
      junior: '3.25',
      docente: '4.50',
    });
  });

  it('con la nota en proceso, la celda de la feria queda vacía', async () => {
    const { feria } = await run(null);
    expect(feria ?? '').toBe('');
  });
});
