import { EditionStatus, JurorEditionStatus, JurorType } from '@prisma/client';
import { PaginatedResult } from 'src/common/types/paginated-result.type';

/** AUTOMATIC = profesor con NRC activo en la edición (no editable). */
export const AUTOMATIC_STATUS = 'AUTOMATIC' as const;
export type JurorEditionListStatus =
  | JurorEditionStatus
  | typeof AUTOMATIC_STATUS;
export const JUROR_EDITION_LIST_STATUSES = [
  ...Object.values(JurorEditionStatus),
  AUTOMATIC_STATUS,
] as JurorEditionListStatus[];

/** ENROLLED: tiene fila en la edición (jurado externo o, desde HU-28, profesor sin NRC). */
export type JurorEditionSource = 'ENROLLED' | 'PROFESSOR_NRC';

export interface EditionJurorItem {
  jurorId: string;
  firstName: string;
  lastName: string;
  email: string;
  category: string;
  type: JurorType | null;
  status: JurorEditionListStatus;
  source: JurorEditionSource;
  /** HU-24: el administrador lo dio de alta el día de la feria (llegó sin estar registrado). */
  walkIn: boolean;
  updatedAt: Date | null;
}

export type EditionJurorCounts = Record<JurorEditionListStatus, number>;

export interface EditionSummary {
  id: number;
  title: string;
  status: EditionStatus;
  /** Si la lista de jurados acepta cambios (ver `assertWritable`). */
  writable: boolean;
}

export interface PaginatedEditionJurors
  extends PaginatedResult<EditionJurorItem> {
  edition: EditionSummary;
  counts: EditionJurorCounts;
}

export interface ImportPreviousResult {
  sourceEditionId: number;
  created: number;
  skipped: number;
  /** true cuando la edición anterior no tenía lista y se trajo a todos los jurados activos. */
  fallback: boolean;
}

/**
 * NOT_ENROLLED: no tiene fila en la edición (un profesor sin NRC se inscribe por correo, HU-28).
 * IS_PROFESSOR: profesor automático (NRC activo en la edición); no se confirma ni declina.
 */
export type StatusRowError = 'NOT_ENROLLED' | 'IS_PROFESSOR';

export interface StatusRowResult {
  jurorId: string;
  ok: boolean;
  error?: StatusRowError;
}

export interface UpdateStatusResult {
  results: StatusRowResult[];
  /** Pendientes que pasaron a Declinó por `declineRemaining`. */
  declined: number;
}
