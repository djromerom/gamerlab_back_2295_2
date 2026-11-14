import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AnswerJurorSurveyDto } from './dto/answer-juror-survey.dto';
import {
  buildSurveyFileName,
  buildSurveyWorkbook,
} from './juror-survey-export';
import {
  SURVEY_FIELDS,
  summarizeFields,
  surveyUnavailableReason,
} from './survey-rules';

const scores = (n: number) => ({
  loginEase: n,
  groupsClarity: n,
  gradingEase: n,
  stability: n,
  fairOrganization: n,
  overall: n,
});

describe('Encuesta del jurado: regla de «terminó de evaluar» (HU-17)', () => {
  const base = {
    isEditionJuror: true,
    assigned: 3,
    evaluated: 3,
    answered: false,
  };

  it('disponible cuando evaluó todos sus grupos y no la ha respondido', () => {
    expect(surveyUnavailableReason(base)).toBeNull();
  });

  it.each([
    [{ ...base, evaluated: 2 }, 'PENDING_EVALUATIONS'],
    [{ ...base, assigned: 0, evaluated: 0 }, 'NO_ASSIGNED_TEAMS'],
    [{ ...base, isEditionJuror: false }, 'NOT_EDITION_JUROR'],
    [{ ...base, answered: true }, 'ALREADY_ANSWERED'],
    [{ ...base, evaluated: 1, answered: true }, 'ALREADY_ANSWERED'],
  ])('%j -> %s', (progress, reason) => {
    expect(surveyUnavailableReason(progress)).toBe(reason);
  });
});

describe('Resumen por campo', () => {
  it('promedio con 2 decimales y distribución de 1 a 5', () => {
    const [first] = summarizeFields([scores(5), scores(4), scores(4)]);
    expect(first).toEqual({
      key: 'loginEase',
      label: SURVEY_FIELDS[0].label,
      average: 4.33,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 },
    });
  });

  it('sin respuestas el promedio es null', () => {
    const fields = summarizeFields([]);
    expect(fields).toHaveLength(6);
    expect(fields.every((f) => f.average === null)).toBe(true);
  });
});

describe('Validación del cuerpo (P-13)', () => {
  const errorsOf = (body: object) =>
    validateSync(plainToInstance(AnswerJurorSurveyDto, body)).map(
      (e) => e.property,
    );

  it('acepta los 6 campos de 1 a 5 y el comentario opcional', () => {
    expect(errorsOf(scores(3))).toEqual([]);
    expect(errorsOf({ ...scores(1), comments: 'Todo bien' })).toEqual([]);
  });

  it('los 6 campos son obligatorios', () => {
    const { overall: _omit, ...rest } = scores(3);
    expect(errorsOf(rest)).toEqual(['overall']);
  });

  it.each([0, 6, 3.5])('rechaza %p', (n) => {
    expect(errorsOf({ ...scores(3), stability: n })).toEqual(['stability']);
  });

  it('comentario de hasta 1000 caracteres (sin contar espacios de los extremos)', () => {
    expect(
      errorsOf({ ...scores(3), comments: `  ${'a'.repeat(1000)}  ` }),
    ).toEqual([]);
    expect(errorsOf({ ...scores(3), comments: 'a'.repeat(1001) })).toEqual([
      'comments',
    ]);
  });
});

describe('Excel de la encuesta', () => {
  it('nombre del archivo con la edición y la fecha de Colombia', () => {
    expect(
      buildSurveyFileName(
        { year: 2026, semester: 30 },
        new Date('2026-11-27T03:00:00Z'),
      ),
    ).toBe('encuesta_jurados_2026-30_2026-11-26.xlsx');
  });

  it('hoja Respuestas con el jurado, los 6 campos y el comentario; hoja Resumen con promedios', () => {
    const row = {
      jurorName: 'Ana Gómez',
      email: 'ana@uninorte.edu.co',
      role: 'Jurado',
      ...scores(4),
      comments: 'Muy bien',
      createdAt: new Date('2026-11-26T15:30:00Z'),
    };
    const workbook = buildSurveyWorkbook([row], {
      edition: { id: 3, title: 'Feria 2026-30', year: 2026, semester: 30 },
      totals: { responses: 1, jurorsFinished: 2, editionJurors: 5 },
      fields: summarizeFields([row]),
    });

    const answers = workbook.getWorksheet('Respuestas')!;
    expect(answers.getRow(1).values).toEqual([
      undefined,
      'Jurado',
      'Correo',
      'Rol',
      ...SURVEY_FIELDS.map((f) => f.label),
      'Comentarios y sugerencias',
      'Fecha',
    ]);
    expect(answers.getRow(2).values).toEqual([
      undefined,
      'Ana Gómez',
      'ana@uninorte.edu.co',
      'Jurado',
      4,
      4,
      4,
      4,
      4,
      4,
      'Muy bien',
      '2026-11-26 10:30',
    ]);

    const resume = workbook.getWorksheet('Resumen')!;
    expect(resume.getRow(2).values).toEqual([
      undefined,
      SURVEY_FIELDS[0].label,
      4,
      0,
      0,
      0,
      1,
      0,
    ]);
    expect(resume.getRow(9).values).toEqual([
      undefined,
      'Respuestas recibidas',
      1,
    ]);
    expect(resume.getRow(10).values).toEqual([
      undefined,
      'Jurados que terminaron de evaluar',
      2,
    ]);
  });
});
