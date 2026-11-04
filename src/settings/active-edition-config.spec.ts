import { ForbiddenException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  ACTIVE_EDITION_CONFIG_WHERE,
  EVALUATIONS_CLOSED_MESSAGE,
  assertEvaluationsOpen,
  findActiveEditionConfig,
} from './active-edition-config';

/** ARK-134 (BG-21): la configuración del evento siempre es la de la edición activa. */
describe('Configuración del evento de la edición activa (ARK-134)', () => {
  const findFirst = jest.fn();
  const prisma = { eventConfiguration: { findFirst } } as never;

  beforeEach(() => findFirst.mockReset());

  it('el filtro es la edición ACTIVE', () => {
    expect(ACTIVE_EDITION_CONFIG_WHERE).toEqual({
      edition: { status: EditionStatus.ACTIVE },
    });
  });

  it('findActiveEditionConfig consulta solo con ese filtro', async () => {
    findFirst.mockResolvedValue({ id: 2, editionId: 5 });
    await expect(findActiveEditionConfig(prisma)).resolves.toEqual({ id: 2, editionId: 5 });
    expect(findFirst).toHaveBeenCalledWith({ where: ACTIVE_EDITION_CONFIG_WHERE });
  });

  it('assertEvaluationsOpen deja pasar si la activa está abierta', async () => {
    findFirst.mockResolvedValue({ evaluationsOpen: true });
    await expect(assertEvaluationsOpen(prisma)).resolves.toBeUndefined();
  });

  it.each([
    ['cerrada', { evaluationsOpen: false }],
    ['sin configuración', null],
  ])('assertEvaluationsOpen responde 403 si la activa está %s', async (_name, config) => {
    findFirst.mockResolvedValue(config);
    const error = await assertEvaluationsOpen(prisma).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toBe(EVALUATIONS_CLOSED_MESSAGE);
  });
});

/**
 * Regresión estática: falla si alguien vuelve a leer `eventConfiguration.findFirst` sin el filtro
 * de la edición activa (con varias ediciones, Prisma devuelve la fila de cualquiera).
 */
describe('Nadie lee la configuración del evento sin la edición activa (ARK-134)', () => {
  const SRC = join(__dirname, '..');
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
    });

  it('cada eventConfiguration.findFirst usa ACTIVE_EDITION_CONFIG_WHERE', () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf8');
      const rel = relative(SRC, path).replace(/\\/g, '/');
      const calls = text.matchAll(/eventConfiguration\.findFirst\(/g);
      for (const call of calls) {
        const args = text.slice(call.index!, call.index! + 160);
        if (!args.includes('ACTIVE_EDITION_CONFIG_WHERE')) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
