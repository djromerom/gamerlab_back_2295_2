import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { BatchEvaluationDto } from './batchEvaluation.dto';
import { CreateEvaluationDto } from './createEvaluation.dto';

/**
 * ARK-250: el ValidationPipe real (el mismo de main.ts) rechaza con 400 los puntajes nulos,
 * vacíos o que no son número, en el envío individual y en el lote. Un 0 explícito es válido.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const single = (score: unknown, extra: object = {}) => ({
  videogameId: 1,
  comments: 'ok',
  details: [{ criterionId: 1, score, ...extra }],
});

const parseSingle = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: CreateEvaluationDto });
const parseBatch = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: BatchEvaluationDto });

describe('CreateEvaluationDto (ARK-250)', () => {
  it.each([
    ['null', null],
    ['cadena vacía', ''],
    ['espacios', '  '],
    ['texto', 'abc'],
    ['número como texto', '4'],
    ['NaN', Number.NaN],
    ['arreglo', []],
  ])('rechaza con 400 un puntaje %s', async (_name, score) => {
    await expect(parseSingle(single(score))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza con 400 un detalle sin la propiedad score', async () => {
    await expect(
      parseSingle({ videogameId: 1, details: [{ criterionId: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un 0 escrito explícitamente es válido y se conserva como 0', async () => {
    const dto = (await parseSingle(single(0))) as CreateEvaluationDto;
    expect(dto.details[0].score).toBe(0);
  });

  it('acepta el cuerpo que envía el front (sin fechas ni isActive)', async () => {
    const dto = (await parseSingle(single(4.5))) as CreateEvaluationDto;
    expect(dto.details[0].score).toBe(4.5);
  });

  it('en el lote, un puntaje nulo en cualquier fila rechaza toda la petición con 400', async () => {
    await expect(
      parseBatch({ evaluations: [single(4), single(null)] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el mensaje del 400 explica qué falta', async () => {
    const error: unknown = await parseSingle(single(null)).catch(
      (e: unknown) => e,
    );
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain('no puede ser nulo');
  });
});
