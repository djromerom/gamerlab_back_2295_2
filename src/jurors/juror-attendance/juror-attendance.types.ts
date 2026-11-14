import { CheckInMethod } from '@prisma/client';

/** Estado de asistencia de un jurado en la edición (HU-29). HU-12 podrá agregar otros. */
export const ATTENDANCE_STATUSES = ['PRESENT', 'MISSING'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Una fila de la tabla de asistencia. Sin correos ni códigos. */
export interface JurorAttendanceItem {
  jurorId: string;
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
