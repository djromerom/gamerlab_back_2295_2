import { ListEdition } from '../../editions/list-edition';

/**
 * ARK-129 (HU-26): estados de un estudiante en una edición.
 * - Por edición: el del videojuego de su equipo y si el integrante está activo.
 * - Global: el de la cuenta (correo verificado), que no cambia entre ediciones.
 */
export const PARTICIPATION_VIDEOGAME_STATUSES = [
  'PENDIENTE',
  'CONFIRMADO',
  'RECHAZADO',
] as const;
export type ParticipationVideogameStatus =
  (typeof PARTICIPATION_VIDEOGAME_STATUSES)[number];

/** Estado de la cuenta (`estados_confirmacion`). `null`: el integrante no tiene cuenta. */
export type AccountStatus = 'CONFIRMADO' | 'PENDIENTE' | 'EXPIRADO' | string;

export interface EditionStudentItem {
  memberId: number;
  firstName: string;
  lastName: string;
  email: string;
  studentCode: string;
  /** Integrante activo en el equipo de esta edición. */
  isActive: boolean;
  /** Es el líder del equipo (su cuenta creó el equipo). */
  isLeader: boolean;
  team: {
    id: number;
    teamName: string;
    teamCode: string;
    isActive: boolean;
  };
  /** Estado del videojuego del equipo en esta edición; `null` si el equipo no tiene videojuego. */
  videogameStatus: ParticipationVideogameStatus | null;
  /** Global: solo quien tiene cuenta (el líder, o quien lideró en otra edición); si no, `null`. */
  accountStatus: AccountStatus | null;
}

export interface EditionStudentsSummary {
  /** Integrantes de la edición (sin filtros de búsqueda ni de estado). */
  total: number;
  active: number;
  inactive: number;
  byVideogameStatus: Record<ParticipationVideogameStatus, number>;
}

export interface EditionStudentsList {
  /** `null` cuando no se pidió edición y no hay una activa. */
  edition: ListEdition | null;
  summary: EditionStudentsSummary;
  data: EditionStudentItem[];
  metadata: {
    totalItems: number;
    itemsOnCurrentPage: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
  };
}
