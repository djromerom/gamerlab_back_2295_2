import {
  isIgnoredZipPath,
  MAX_ZIP_SIZE_BYTES,
  pickZipEntry,
} from './zip-entry.logic';

const entry = (names: string[]) => {
  const result = pickZipEntry(names);
  return result.ok ? result.entry : `ERROR: ${result.message}`;
};

describe('SP-03: entrada del juego dentro del .zip', () => {
  it('usa el index.html de la raíz', () => {
    expect(entry(['index.html', 'Build/game.wasm', 'otro.html'])).toBe(
      'index.html',
    );
  });

  it('prefiere el index.html más cercano a la raíz, sin importar el orden del zip', () => {
    expect(
      entry(['docs/index.html', 'MiJuego/index.html', 'MiJuego/a/index.html']),
    ).toBe('docs/index.html');
    expect(entry(['web/index.html', 'index.html'])).toBe('index.html');
  });

  it('acepta index.html en una subcarpeta (zip de la carpeta y no de su contenido)', () => {
    expect(
      entry(['MiJuego/', 'MiJuego/index.html', 'MiJuego/Build/a.js']),
    ).toBe('MiJuego/index.html');
  });

  it('no confunde miindex.html con index.html', () => {
    expect(entry(['miindex.html', 'index.html'])).toBe('index.html');
  });

  it('acepta INDEX.HTML en mayúsculas', () => {
    expect(entry(['INDEX.HTML', 'b.html'])).toBe('INDEX.HTML');
  });

  it('ignora la basura de macOS y los archivos ocultos (antes quedaba __MACOSX/._index.html)', () => {
    expect(entry(['__MACOSX/._index.html', '._index.html', 'index.html'])).toBe(
      'index.html',
    );
    expect(isIgnoredZipPath('__MACOSX/web/._index.html')).toBe(true);
    expect(isIgnoredZipPath('web/.DS_Store')).toBe(true);
    expect(isIgnoredZipPath('web/')).toBe(true);
    expect(isIgnoredZipPath('web/index.html')).toBe(false);
  });

  it('sin index.html usa el único .html (exportación de Godot con otro nombre)', () => {
    expect(entry(['MiJuego.html', 'MiJuego.wasm', 'MiJuego.pck'])).toBe(
      'MiJuego.html',
    );
  });

  it('sin index.html y con varios .html pide renombrar, y lista los encontrados', () => {
    const result = pickZipEntry(['creditos.html', 'juego.html']);

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining('creditos.html, juego.html'),
    });
  });

  it('lista como máximo 5 nombres', () => {
    const names = Array.from({ length: 7 }, (_, i) => `p${i}.html`);
    const result = pickZipEntry(names);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('p4.html…');
    expect(!result.ok && result.message).not.toContain('p5.html');
  });

  it('sin .html (o solo basura de macOS) responde con el mensaje de index.html', () => {
    for (const names of [[], ['Build/a.wasm'], ['__MACOSX/._index.html']]) {
      expect(pickZipEntry(names)).toEqual({
        ok: false,
        message: expect.stringContaining('no tiene un index.html'),
      });
    }
  });

  it('el límite es de 100 MB', () => {
    expect(MAX_ZIP_SIZE_BYTES).toBe(100 * 1024 * 1024);
  });
});
