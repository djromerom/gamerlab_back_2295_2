import { JurorType } from '@prisma/client';

/** HU-49 (ARK-280): lo que pasó con cada fila del Excel. */
export type ImportRowResult =
  | 'CREATED' // no había cuenta: se creó y quedó confirmado
  | 'CONFIRMED' // la cuenta existía: quedó confirmado (estaba Pendiente, Declinó o sin fila)
  | 'ALREADY_CONFIRMED' // ya estaba confirmado (o es profesor automático): no se duplica
  | 'ERROR';

export type ImportRowErrorCode =
  | 'MISSING_FIELD'
  | 'INVALID_EMAIL'
  | 'INVALID_NAME'
  | 'INVALID_TYPE'
  | 'DUPLICATE_IN_FILE'
  | 'WRONG_ROLE'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_CREATION_FAILED'
  | 'UNEXPECTED';

/**
 * QUEUED: el correo para crear la contraseña (o verificar la cuenta) quedó en la cola de envío
 * y sale con pausa entre uno y otro. NOT_NEEDED: la cuenta ya estaba activa o la fila falló.
 */
export type ImportRowEmailStatus = 'QUEUED' | 'NOT_NEEDED';

export interface ImportRowReport {
  /** Número de fila en el Excel (la 1 es el encabezado). */
  row: number;
  email: string;
  firstName: string;
  lastName: string;
  type: JurorType | null;
  result: ImportRowResult;
  accountCreated: boolean;
  emailStatus: ImportRowEmailStatus;
  error?: ImportRowErrorCode;
  message?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  confirmed: number;
  alreadyConfirmed: number;
  errors: number;
  emailsQueued: number;
}

export interface ImportJurorsReport {
  edition: { id: number; title: string };
  summary: ImportSummary;
  rows: ImportRowReport[];
}

/** Una fila del Excel tal como viene, sin validar. */
export interface RawImportRow {
  row: number;
  firstName: string;
  lastName: string;
  email: string;
  type: string;
}
