import {
  CheckInMethod,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
} from '@prisma/client';

/** 409: el correo ya es de una cuenta (jurado, profesor o cualquier otro rol). */
export const EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS';
/** 409: hay jurados o profesores con un nombre parecido; se confirma con `confirmSimilar`. */
export const SIMILAR_PEOPLE = 'SIMILAR_PEOPLE';

/**
 * Una persona que ya existe, para que el administrador decida sin salir de la pantalla. Sin
 * correo: quien lo escribió ya lo conoce y los parecidos por nombre no lo necesitan.
 */
export interface ExistingPerson {
  id: string;
  name: string;
  /** Nombre del rol: «Jurado», «Profesor», «Estudiante»... */
  role: string;
  isActive: boolean;
  /** Es jurado de la edición activa (`jurorsOfEdition`): se le puede marcar la llegada. */
  isJurorOfEdition: boolean;
  /** Su fila en `jurado_edicion` de la edición activa; `null` si no tiene. */
  editionStatus: JurorEditionStatus | null;
  /** Hora de su llegada en la edición activa; `null` si no se ha registrado. */
  checkedInAt: Date | null;
}

export interface WalkInJurorResult {
  juror: {
    id: string;
    name: string;
    email: string;
    category: JurorCategory;
    type: JurorType;
  };
  edition: { id: number; title: string };
  attendance: { checkedInAt: Date; method: CheckInMethod };
  walkIn: true;
}
