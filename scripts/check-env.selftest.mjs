// Pruebas de scripts/check-env.mjs. Se corren con `npm run check:env:test` (node --test).
// Nombre `.selftest.mjs` a proposito: jest/vitest no lo recogen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze, valueIssue, CONFIG } from './check-env.mjs';

const DOC = '# Que: x\n# Obligatoria: si\n# Obtener: y\n# Rotar: z\n';
const config = { ...CONFIG, scanPaths: ['src'], ignoreUnused: [] };
// La misma prueba corre en back y front: solo cambia como se lee una variable en el codigo.
const IS_FRONT = CONFIG.patterns.some((p) => p.source.includes('import'));
const USE = (name) => (IS_FRONT ? `import.meta.env.${name}` : `process.env.${name}`);

function project({ example, code = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'check-env-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.env.example'), example);
  writeFileSync(join(root, 'src', 'app.ts'), code);
  return root;
}
const run = (opts, tracked = []) => {
  const root = project(opts);
  try {
    return analyze(root, config, tracked);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
const messages = (list) => list.map((e) => e.message).join('\n');

test('todo en orden: sin errores ni avisos', () => {
  const r = run({ example: `${DOC}JWT_SECRET=\n`, code: `const s = ${USE('JWT_SECRET')};` });
  assert.deepEqual(r, { errors: [], warnings: [] });
});

test('detecta los accesos propios de este repo', () => {
  const code = IS_FRONT
    ? "a(import.meta.env.UNO); b = `${import.meta.env.DOS}/x`;"
    : ['a(process.env.UNO);', 'cfg.get<string>(', "  'DOS',", '  24,', ');', 'x = env("TRES");'].join('\n');
  const r = run({ example: '', code });
  const msg = messages(r.errors);
  for (const name of IS_FRONT ? ['UNO', 'DOS'] : ['UNO', 'DOS', 'TRES']) {
    assert.match(msg, new RegExp(`${name} se usa en src/app.ts`));
  }
});

test('las variables que pone la plataforma no hay que documentarlas', { skip: !IS_FRONT }, () => {
  const r = run({ example: '', code: 'import.meta.env.MODE; import.meta.env.DEV; import.meta.env.BASE_URL' });
  assert.deepEqual(r.errors, []);
});

test('variable usada en el codigo y ausente del ejemplo es error', () => {
  const r = run({ example: '', code: USE('NUEVA_VAR') });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /NUEVA_VAR se usa en src\/app.ts:1/);
});

test('falta un campo de documentacion o hay linea en blanco entre comentario y variable', () => {
  const r = run({ example: '# Que: x\n# Obtener: y\nA=\n\n' + DOC + '\nB=\n', code: `${USE('A')}; ${USE('B')}` });
  assert.match(messages(r.errors), /A: falta documentar Obligatoria, Rotar/);
  assert.match(messages(r.errors), /B: falta documentar Que, Obligatoria, Obtener, Rotar/);
});

test('variable documentada que ya no se usa es solo aviso', () => {
  const r = run({ example: `${DOC}VIEJA=\n`, code: '' });
  assert.equal(r.errors.length, 0);
  assert.match(r.warnings[0].message, /VIEJA esta documentada/);
});

test('valores del ejemplo: vacios, de relleno y locales pasan; secretos reales no', () => {
  assert.equal(valueIssue('JWT_SECRET', ''), null);
  assert.equal(valueIssue('JWT_SECRET', 'changeme'), null);
  assert.equal(valueIssue('NODE_ENV', 'development'), null);
  assert.equal(valueIssue('DATABASE_URL', 'postgresql://u:p@localhost:5432/db'), null);
  assert.ok(valueIssue('JWT_SECRET', 'abc123'));
  assert.ok(valueIssue('ACS_CONNECTION_STRING', 'endpoint=https://x;accesskey=abc'));
  assert.ok(valueIssue('DATABASE_URL', 'postgresql://admin:Sup3r@db.prod.example.com:5432/arkad'));
  assert.ok(valueIssue('OTRA', 'AKIAIOSFODNN7EXAMPLEKEYabcdefghijkl'));
  assert.ok(valueIssue('X', 'DefaultEndpointsProtocol=https;AccountKey=abc=='));
});

test('archivos prohibidos versionados son error; .env.example no', () => {
  const r = run(
    { example: '' },
    ['.env.example', '.env', 'cookies.txt', 'docs/output.sql', 'infra/server.pem', 'credenciales.txt', 'src/app.ts'],
  );
  const files = r.errors.map((e) => e.file).sort();
  assert.deepEqual(files, ['.env', 'cookies.txt', 'credenciales.txt', 'docs/output.sql', 'infra/server.pem']);
});

test('sin .env.example es error claro', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-env-'));
  try {
    const r = analyze(root, config, []);
    assert.match(r.errors[0].message, /no existe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
