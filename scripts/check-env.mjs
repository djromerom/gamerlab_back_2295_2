#!/usr/bin/env node
/*
 * check-env.mjs (ARK-43)
 *
 * Mantiene ordenadas las variables de entorno. Falla (exit 1) si:
 *   1. el codigo usa una variable que no esta en .env.example;
 *   2. a una variable de .env.example le falta alguno de los campos de documentacion
 *      (Que / Obligatoria / Obtener / Rotar);
 *   3. el .env.example trae un valor que parece real (secretos, llaves, URLs con credenciales);
 *   4. hay versionado un archivo que no debe estar en el repo (.env, cookies.txt, llaves...).
 * Solo avisa (no falla) si una variable del ejemplo ya no se usa en el codigo.
 *
 * Uso:   node scripts/check-env.mjs [--root <carpeta>]      (o `npm run check:env`)
 * Sin dependencias. La copia del front es identica salvo el bloque CONFIG.
 *
 * Limites conocidos: solo ve accesos con el nombre escrito literalmente en el codigo
 * (process.env.X, config.get('X'), env("X") en Prisma); un acceso dinamico, como
 * process.env[nombre], no se detecta: documentarlo a mano y agregarlo a `ignoreUnused`.
 * Tampoco valida los valores reales del servidor ni los secrets de GitHub.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- CONFIG (lo unico que cambia entre back y front) -------------------------------
export const CONFIG = {
  example: '.env.example',
  // Carpetas o archivos (relativos a la raiz) donde buscar usos de variables.
  scanPaths: ['src', 'scripts', 'prisma', 'seed.ts'],
  extensions: ['.ts', '.tsx', '.js', '.mjs', '.prisma'],
  // Archivos que no cuentan como "uso" (pruebas y este mismo script).
  skipFile: /(\.(spec|test|selftest)\.[cm]?[jt]sx?$)|(^|\/)check-env\.mjs$|(^|\/)(node_modules|dist|coverage)\//,
  // Cada patron debe tener un grupo de captura con el nombre de la variable.
  patterns: [
    /\b(?:process\.env|env)\.([A-Z][A-Z0-9_]*)\b/g, // process.env.X, env.X
    /\.(?:get|getOrThrow)(?:<[^>]*>)?\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g, // configService.get('X')
    /\benv\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g, // env("X") en schema.prisma
  ],
  // Se usan en el codigo pero no hace falta documentarlas (las pone la plataforma).
  ignoreUsed: [],
  // Se documentan aunque el codigo no las lea con su nombre literal.
  // EVENT_* se leen con el helper read('EVENT_...') de email.service.ts, no con un acceso directo.
  ignoreUnused: ['EVENT_DATE_TEXT', 'EVENT_TIME_TEXT', 'EVENT_PLACE_TEXT'],
};
// -------------------------------------------------------------------------------------

const REQUIRED_DOC_FIELDS = [
  ['Que', /^#\s*Qu[eé]\s*:\s*\S/i],
  ['Obligatoria', /^#\s*Obligatoria\s*:\s*\S/i],
  ['Obtener', /^#\s*Obtener\s*:\s*\S/i],
  ['Rotar', /^#\s*Rotar\s*:\s*\S/i],
];

const FORBIDDEN_FILES = [
  [/(^|\/)\.env(?!\.example$)(\..+)?$/, 'archivo .env (las variables viven en el servidor o en GitHub Secrets)'],
  [/(^|\/)cookies\.txt$/i, 'cookies.txt (contiene sesiones)'],
  [/(^|\/)output\.sql$/i, 'output.sql (volcado con usuarios y contrasenas cifradas)'],
  [/\.(pem|key|p12|pfx)$/i, 'llave o certificado privado'],
  [/(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/, 'llave SSH privada'],
  [/credencial|(^|\/)credentials?\.(txt|json|csv)$/i, 'archivo de credenciales'],
];

const SECRET_NAME = /(SECRET|PASSWORD|PASSPHRASE|TOKEN|PRIVATE|ACCOUNT_KEY|CONNECTION_STRING|SAS_URL)/;
const PLACEHOLDER = /^(changeme|change-me|replace-me|your[-_].*|x{3,}|\.{3}|<.*>)$/i;
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|db|postgres|host\.docker\.internal)$/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const norm = (p) => p.replace(/\\/g, '/');

/** Variables usadas en el codigo: Map nombre -> "archivo:linea" de la primera aparicion. */
export function findUsedVars(root, config = CONFIG) {
  const used = new Map();
  const files = [];
  for (const p of config.scanPaths) {
    const full = join(root, p);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  for (const file of files) {
    const rel = norm(file.slice(root.length + 1));
    if (config.skipFile.test(rel) || !config.extensions.includes(extname(file))) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of config.patterns) {
      for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
        const name = m[1];
        if (config.ignoreUsed.includes(name) || used.has(name)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        used.set(name, `${rel}:${line}`);
      }
    }
  }
  return used;
}

/** Variables del .env.example con su valor y el bloque de comentarios que las precede. */
export function parseExample(text) {
  const entries = [];
  let block = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') block = [];
    else if (line.startsWith('#')) block.push(line);
    else {
      const m = /^([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      if (m) entries.push({ name: m[1], value: m[2], line: i + 1, docs: block });
      block = [];
    }
  });
  return entries;
}

/** Devuelve un motivo si el valor del ejemplo parece real; null si esta bien. */
export function valueIssue(name, rawValue) {
  const value = rawValue.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  if (value === '' || PLACEHOLDER.test(value)) return null;
  if (/-----BEGIN|AccountKey=|SharedAccessSignature|[?&]sig=/i.test(value)) return 'contiene una llave o firma';
  if (SECRET_NAME.test(name)) return 'es un secreto: dejarlo vacio o con un valor de relleno (changeme)';
  const url = /^[a-z][a-z0-9+.-]*:\/\/([^/@\s:]+):([^/@\s]+)@([^/:\s]+)/i.exec(value);
  if (url && !LOCAL_HOSTS.test(url[3])) return 'URL con usuario y contrasena en un host que no es local';
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(value)) return 'parece un token o una clave real';
  return null;
}

export function trackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/** Corre todas las comprobaciones. No toca el sistema de archivos mas alla de leer. */
export function analyze(root, config = CONFIG, tracked = trackedFiles(root)) {
  const errors = [];
  const warnings = [];
  const examplePath = join(root, config.example);
  if (!existsSync(examplePath)) {
    return { errors: [{ file: config.example, message: 'no existe; crearlo a partir de las variables que usa el codigo' }], warnings };
  }
  const entries = parseExample(readFileSync(examplePath, 'utf8'));
  const documented = new Set(entries.map((e) => e.name));
  const used = findUsedVars(root, config);

  for (const [name, where] of used) {
    if (!documented.has(name)) {
      errors.push({ file: config.example, message: `${name} se usa en ${where} pero no esta en ${config.example}` });
    }
  }

  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.name)) errors.push({ file: config.example, line: e.line, message: `${e.name} esta repetida` });
    seen.add(e.name);
    const missing = REQUIRED_DOC_FIELDS.filter(([, re]) => !e.docs.some((d) => re.test(d))).map(([label]) => label);
    if (missing.length) {
      errors.push({ file: config.example, line: e.line, message: `${e.name}: falta documentar ${missing.join(', ')} (comentarios justo encima, sin lineas en blanco)` });
    }
    const issue = valueIssue(e.name, e.value);
    if (issue) errors.push({ file: config.example, line: e.line, message: `${e.name}: ${issue}` });
    if (!used.has(e.name) && !config.ignoreUnused.includes(e.name)) {
      warnings.push({ file: config.example, line: e.line, message: `${e.name} esta documentada pero el codigo ya no la usa; quitarla o agregarla a ignoreUnused` });
    }
  }

  if (tracked === null) {
    warnings.push({ file: '.', message: 'no se pudo ejecutar `git ls-files`; se omitio la revision de archivos prohibidos' });
  } else {
    for (const file of tracked) {
      const hit = FORBIDDEN_FILES.find(([re]) => re.test(file));
      if (hit) errors.push({ file, message: `no debe estar versionado: ${hit[1]}` });
    }
  }
  return { errors, warnings };
}

function report(kind, items) {
  const github = process.env.GITHUB_ACTIONS === 'true';
  for (const { file, line, message } of items) {
    const where = line ? `${file}:${line}` : file;
    if (github) {
      const props = `file=${file}${line ? `,line=${line}` : ''}`;
      console.log(`::${kind === 'ERROR' ? 'error' : 'warning'} ${props}::${message}`);
    } else {
      console.log(`${kind}  ${where}  ${message}`);
    }
  }
}

function main() {
  const i = process.argv.indexOf('--root');
  const root = resolve(i > -1 ? process.argv[i + 1] : process.cwd());
  const { errors, warnings } = analyze(root);
  report('AVISO', warnings);
  report('ERROR', errors);
  console.log(`check-env: ${errors.length} error(es), ${warnings.length} aviso(s)`);
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
