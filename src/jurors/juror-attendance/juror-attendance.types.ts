import { CheckInMethod } from '@prisma/client';

/** Estado de asistencia de un jurado en la edición (HU-29). HU-12 podrá agregar otros. */
export const ATTENDANCE_STATUSES = ['PRESENT', 'MISSING'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Una fila de la tabla de asistencia. Sin correos ni códigos. */
export interface JurorAttendanceItem {
  jurorId: string;
  /** Id de la llegada activa (para anularla, BG-49); null si el jurado no ha llegado. */
  attendanceId: number | null;
  name: string;
  category: string;
  isProfessor: boolean;
  hasBadge: boolean;
  status: AttendanceStatus;
  checkedInAt: Date | null;
  method: CheckInMethod | null;
  checkedInBy: { id: string; name: string } | null;
}

export interface AttendanceTotals {
  present: number;
  missing: number;
  total: number;
}

/** Fila con los datos que solo sirven para buscar y ordenar (no salen en la respuesta). */
export interface AttendanceRow {
  item: JurorAttendanceItem;
  firstName: string;
  lastName: string;
}

/** Una persona en la respuesta, sin correo. */
export interface PersonRef {
  id: string;
  name: string;
}

/** BG-49: la llegada anulada, con quién la registró y quién la anuló. */
export interface AnnulledArrival {
  attendanceId: number;
  edition: { id: number; title: string };
  juror: PersonRef;
  checkedInAt: Date;
  method: CheckInMethod;
  checkedInBy: PersonRef;
  annulledAt: Date;
  annulledBy: PersonRef;
  annulmentReason: string | null;
  /** Estado del jurado después de anular: vuelve a «Sin check-in». */
  jurorStatus: 'MISSING';
}
