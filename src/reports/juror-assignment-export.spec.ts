import * as ExcelJS from 'exceljs';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import {
  JurorAssignmentSource,
  bogotaDate,
  buildJurorAssignmentFileName,
  buildJurorAssignmentWorkbook,
  sortJurorAssignmentRows,
  teamLevel,
  toJurorAssignmentRow,
} from './juror-assignment-export';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';

/** HU-16 (ARK-108): reporte de jurados con la asignación de la edición. */
const source = (
  over: Partial<JurorAssignmentSource> = {},
): JurorAssignmentSource => ({
  firstName: 'María José',
  lastName: 'Peña',
  email: 'mjpena@uninorte.edu.co',
  status: 'Confirmado',
  jurorCategory: 'SENIOR',
  jurorType: 'OFFICIAL',
  assigned: [
    { teamCode: 'N2-IST-10', videogameId: 20, videogameName: 'Ñandú' },
    { teamCode: 'N0-COL-2', videogameId: 5, videogameName: 'Árbol' },
    { teamCode: 'N2-IST-9', videogameId: 19, videogameName: null },
  ],
  evaluatedVideogameIds: [5],
  ...over,
});

describe('juror-assignment-export (HU-16)', () => {
  it('teamLevel lee el nivel del código', () => {
    expect(teamLevel('N2-IST-10')).toBe('N2');
    expect(teamLevel('n10-x-1')).toBe('N10');
    expect(teamLevel('SIN')).toBeNull();
  });

  it('arma la fila con categoría, tipo, niveles y grupos asignados, revisados y pendientes', () => {
    expect(toJurorAssignmentRow(source())).toEqual({
      nombre: 'María José Peña',
      correo: 'mjpena@uninorte.edu.co',
      estado: 'Confirmado',
      categoria: 'Senior',
      tipo: 'Oficial',
      niveles: 'N0, N2',
      totalAsignados: 3,
      asignados: ['N0-COL-2 · Árbol', 'N2-IST-9', 'N2-IST-10 · Ñandú'],
      revisados: ['N0-COL-2 · Árbol'],
      pendientes: ['N2-IST-9', 'N2-IST-10 · Ñandú'],
    });
  });

  it('marca lo que falta y deja la fila de un jurado sin grupos', () => {
    const row = toJurorAssignmentRow(
      source({
        firstName: null,
        lastName: null,
        status: null,
        jurorCategory: null,
        jurorType: 'BACKUP',
        assigned: [],
      }),
    );
    expect(row).toMatchObject({
      nombre: 'Nombre no disponible',
      estado: 'Sin estado',
      categoria: 'Sin categoría',
      tipo: 'Suplente',
      niveles: '',
      totalAsignados: 0,
      asignados: [],
    });
  });

  it('ordena oficiales antes que suplentes y luego por nombre', () => {
    const rows = sortJurorAssignmentRows([
      toJurorAssignmentRow(source({ firstName: 'Ana', jurorType: 'BACKUP' })),
      toJurorAssignmentRow(source({ firstName: 'Zoe' })),
      toJurorAssignmentRow(source({ firstName: 'Ángel' })),
    ]);
    expect(rows.map((r) => [r.tipo, r.nombre])).toEqual([
      ['Oficial', 'Ángel Peña'],
      ['Oficial', 'Zoe Peña'],
      ['Suplente', 'Ana Peña'],
    ]);
  });

  it('el nombre del archivo lleva la feria y la fecha de Colombia', () => {
    // 2026-11-27 03:00 UTC = 2026-11-26 22:00 en Bogotá
    const date = new Date('2026-11-27T03:00:00Z');
    expect(bogotaDate(date)).toBe('2026-11-26');
    expect(
      buildJurorAssignmentFileName({ year: 2026, semester: 30 }, date),
    ).toBe('asignacion_jurados_2026-30_2026-11-26.xlsx');
  });

  it('el Excel conserva tildes y pone un grupo por línea', async () => {
    const wb = buildJurorAssignmentWorkbook(
      [toJurorAssignmentRow(source())],
      'Feria 2026-30',
    );
    const buffer = await wb.xlsx.writeBuffer();
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(buffer as ArrayBuffer);
    const sheet = read.getWorksheet('Asignación de jurados')!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Nombre jurado',
      'Correo',
      'Estado',
      'Categoría',
      'Tipo',
      'Niveles',
      'N.º grupos',
      'Grupos asignados',
      'Grupos revisados',
      'Grupos pendientes',
    ]);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe('María José Peña');
    expect(row.getCell(7).value).toBe(3);
    expect(row.getCell(8).value).toBe(
      'N0-COL-2 · Árbol\nN2-IST-9\nN2-IST-10 · Ñandú',
    );
  });
});

describe('ReportsService.getJurorAssignmentReport (HU-16)', () => {
  const edition = { id: 3, year: 2026, semester: 30, title: 'Feria 2026-30' };
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const service = new ReportsService(prisma as any, {} as any, {} as any);

  const user = (teams: any[], evals: number[] = []) => ({
    firstName: 'Ana',
    lastName: 'Ruiz',
    email: 'ana@x.co',
    jurorCategory: 'JUNIOR',
    jurorType: 'OFFICIAL',
    jurorEditions: [{ type: 'OFFICIAL' }],
    teamsToEvaluate: teams,
    evaluationsSubmitted: evals.map((videogameId) => ({ videogameId })),
  });

  beforeEach(() => jest.resetAllMocks());

  it('usa la edición activa y filtra grupos y evaluaciones por esa edición', async () => {
    prisma.edition.findFirst.mockResolvedValue(edition);
    prisma.user.findMany.mockResolvedValue([
      user([{ teamCode: 'N1-A-1', videogame: { id: 7, name: 'Juego' } }], [7]),
    ]);

    const res = await service.getJurorAssignmentReport();

    expect(prisma.edition.findFirst.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
    });
    const query = prisma.user.findMany.mock.calls[0][0];
    // BG-40: la lista es la de jurorsOfEdition, no todo usuario con rol Jurado
    expect(query.where).toEqual(jurorsOfEdition(3));
    expect(query.select.jurorEditions.where).toEqual({ editionId: 3 });
    expect(query.select.teamsToEvaluate.where).toEqual({
      editionId: 3,
      isActive: true,
      videogame: { is: { videogameStatus: { status: 'CONFIRMADO' } } },
      notGradable: false, // HU-39 (ARK-209)
    });
    expect(query.select.evaluationsSubmitted.where).toEqual({
      editionId: 3,
      isActive: true,
    });
    expect(res.edition).toEqual(edition);
    expect(res.rows[0]).toMatchObject({
      categoria: 'Junior',
      revisados: ['N1-A-1 · Juego'],
      pendientes: [],
    });
  });

  it('BG-40: Estado y Tipo salen de la edición; el profesor con NRC no tiene fila', async () => {
    prisma.edition.findFirst.mockResolvedValue(edition);
    prisma.user.findMany.mockResolvedValue([
      {
        ...user([{ teamCode: 'N1-A-1', videogame: null }]),
        firstName: 'Bea',
        jurorType: 'OFFICIAL',
        jurorEditions: [{ type: 'BACKUP' }],
      },
      {
        ...user([{ teamCode: 'N2-B-1', videogame: null }]),
        firstName: 'Carlos',
        jurorCategory: 'SENIOR',
        jurorEditions: [],
      },
    ]);

    const { rows } = await service.getJurorAssignmentReport();

    expect(rows.map((r) => [r.nombre, r.estado, r.tipo])).toEqual([
      ['Carlos Ruiz', 'Profesor con NRC', 'Oficial'],
      ['Bea Ruiz', 'Confirmado', 'Suplente'],
    ]);
  });

  it('con editionId busca esa edición', async () => {
    prisma.edition.findFirst.mockResolvedValue(edition);
    prisma.user.findMany.mockResolvedValue([
      user([{ teamCode: 'N1-A-1', videogame: null }]),
    ]);
    await service.getJurorAssignmentReport(3);
    expect(prisma.edition.findFirst.mock.calls[0][0].where).toEqual({ id: 3 });
  });

  it('sin edición o sin asignaciones responde 404', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(service.getJurorAssignmentReport()).rejects.toThrow(
      'No hay una edición activa.',
    );

    prisma.edition.findFirst.mockResolvedValue(edition);
    prisma.user.findMany.mockResolvedValue([user([])]);
    await expect(service.getJurorAssignmentReport()).rejects.toThrow(
      new NotFoundException('No hay asignaciones para exportar.'),
    );
  });
});
