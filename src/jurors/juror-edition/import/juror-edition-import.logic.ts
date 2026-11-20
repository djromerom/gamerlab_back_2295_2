import { JurorType } from '@prisma/client';
import { isEmail } from 'class-validator';
import { ENROLLABLE_ROLE_NAMES } from '../jurors-of-edition';
import {
  ImportRowErrorCode,
  ImportRowReport,
  ImportSummary,
  RawImportRow,
} from './juror-edition-import.types';

/** Más filas que esto se rechazan completas: el envío de correos es lento (BG-74). */
export const MAX_IMPORT_ROWS = 500;

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
// Letras de cualquier idioma (Argüello, Müller), espacios, apóstrofo, punto y guion.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u;

export interface ValidImportRow {
  row: number;
  firstName: string;
  lastName: string;
  email: string;
  type: JurorType;
}

export interface InvalidImportRow {
  row: number;
  firstName: string;
  lastName: string;
  email: string;
  type: JurorType | null;
  error: ImportRowErrorCode;
  message: string;
}

/** Minúsculas y sin ningún espacio (HU-49: «se normalizan»). */
export function normalizeImportEmail(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase();
}

/** Recorta y deja un solo espacio entre palabras. */
export function normalizeImportName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Sin tildes y en minúsculas, para comparar encabezados y valores del Tipo. */
export function foldText(raw: string): string {
  return raw.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

/**
 * Tipo del jurado en la edición. Vacío = Oficial (HU-49). Acepta «Oficial»/«Suplente» sin
 * importar mayúsculas ni tildes, y también los nombres internos (OFFICIAL/BACKUP).
 * `null` si el valor no se reconoce.
 */
export function parseJurorType(raw: string): JurorType | null {
  const value = foldText(raw);
  if (value === '' || value === 'oficial' || value === 'official') {
    return JurorType.OFFICIAL;
  }
  if (value === 'suplente' || value === 'backup') return JurorType.BACKUP;
  return null;
}

function invalid(
  raw: RawImportRow,
  error: ImportRowErrorCode,
  message: string,
  type: JurorType | null = null,
): InvalidImportRow {
  return {
    row: raw.row,
    firstName: normalizeImportName(raw.firstName),
    lastName: normalizeImportName(raw.lastName),
    email: normalizeImportEmail(raw.email),
    type,
    error,
    message,
  };
}

function validateRow(raw: RawImportRow): ValidImportRow | InvalidImportRow {
  const firstName = normalizeImportName(raw.firstName);
  const lastName = normalizeImportName(raw.lastName);
  const email = normalizeImportEmail(raw.email);

  const missing = [
    !firstName && 'Nombres',
    !lastName && 'Apellidos',
    !email && 'Correo',
  ].filter(Boolean);
  if (missing.length) {
    return invalid(
      raw,
      'MISSING_FIELD',
      `Faltan datos obligatorios: ${missing.join(', ')}`,
    );
  }
  if (email.length > MAX_EMAIL_LENGTH || !isEmail(email)) {
    return invalid(raw, 'INVALID_EMAIL', 'El correo electrónico no es válido');
  }
  for (const [label, value] of [
    ['Nombres', firstName],
    ['Apellidos', lastName],
  ] as const) {
    if (value.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(value)) {
      return invalid(
        raw,
        'INVALID_NAME',
        `${label} solo puede tener letras y espacios (máximo ${MAX_NAME_LENGTH} caracteres)`,
      );
    }
  }
  const type = parseJurorType(raw.type);
  if (!type) {
    return invalid(
      raw,
      'INVALID_TYPE',
      'El Tipo debe ser Oficial o Suplente (o dejarse vacío para Oficial)',
    );
  }
  return { row: raw.row, firstName, lastName, email, type };
}

export function isInvalidRow(
  row: ValidImportRow | InvalidImportRow,
): row is InvalidImportRow {
  return 'error' in row;
}

/**
 * Valida cada fila por separado: una fila mala no frena a las demás. Si un correo se repite en
 * el archivo, solo cuenta la primera aparición (las otras salen como error).
 */
export function validateImportRows(
  rows: RawImportRow[],
): (ValidImportRow | InvalidImportRow)[] {
  const firstSeen = new Map<string, number>();
  return rows.map((raw) => {
    const result = validateRow(raw);
    if (isInvalidRow(result)) return result;
    const first = firstSeen.get(result.email);
    if (first !== undefined) {
      return {
        ...result,
        error: 'DUPLICATE_IN_FILE',
        message: `El correo ya aparece en la fila ${first}; se importa solo la primera`,
      } satisfies InvalidImportRow;
    }
    firstSeen.set(result.email, result.row);
    return result;
  });
}

export interface ExistingAccount {
  isActive: boolean;
  roleName: string;
  /** `PENDIENTE` o `CONFIRMADO` (verificación del correo); `null` si no tiene. */
  verificationStatus: string | null;
}

export type AccountAction =
  | { kind: 'CREATE' }
  | { kind: 'ENROLL'; resendVerification: boolean }
  | { kind: 'ERROR'; error: ImportRowErrorCode; message: string };

/**
 * Qué hacer con un correo según su cuenta (HU-49):
 * - sin cuenta: crearla;
 * - Jurado o Profesor ya verificados y activos: solo confirmarlos;
 * - Jurado o Profesor sin verificar (`PENDIENTE`, activos o no: `JurorService.create` deja la
 *   cuenta activa hasta que la persona crea su contraseña): reenviar el correo de verificación
 *   y confirmarlos;
 * - inactivos pero ya verificados: alguien los desactivó; no se reactivan desde un Excel;
 * - cualquier otro rol (Estudiante, Administrador…): error.
 */
export function classifyAccount(
  account: ExistingAccount | null,
): AccountAction {
  if (!account) return { kind: 'CREATE' };
  if (!ENROLLABLE_ROLE_NAMES.includes(account.roleName)) {
    return {
      kind: 'ERROR',
      error: 'WRONG_ROLE',
      message: `El correo ya tiene una cuenta con el rol ${account.roleName}, que no es Jurado ni Profesor`,
    };
  }
  const verified = account.verificationStatus === 'CONFIRMADO';
  if (!account.isActive && verified) {
    return {
      kind: 'ERROR',
      error: 'ACCOUNT_DISABLED',
      message:
        'La cuenta está desactivada. Reactívela en Personal → Jurados antes de importarla',
    };
  }
  return { kind: 'ENROLL', resendVerification: !verified };
}

export function summarize(rows: ImportRowReport[]): ImportSummary {
  const count = (result: ImportRowReport['result']) =>
    rows.filter((row) => row.result === result).length;
  return {
    total: rows.length,
    created: count('CREATED'),
    confirmed: count('CONFIRMED'),
    alreadyConfirmed: count('ALREADY_CONFIRMED'),
    errors: count('ERROR'),
    emailsQueued: rows.filter((row) => row.emailStatus === 'QUEUED').length,
  };
}
