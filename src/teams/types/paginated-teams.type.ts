export interface PaginatedTeams {
  data: TeamRowData[];
  metadata: {
    totalItems: number;
    itemsOnCurrentPage: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
  };
}

export interface TeamRowData {
  id_equipo: number;
  nombre_equipo: string;
  fecha_registro: string;
  id_usuario: string;
  id_edicion: number;
  activo: boolean;
  id_estado_confirmacion: number;
  estado_nombre: string;
  externo: boolean;
  integrantes: IntegranteData[];
  videojuego: VideojuegoData | null;
  nrc_info?: NrcInfo;
  materia_info?: MateriaInfo;
}

export interface IntegranteData {
  id_integrante: number;
  nombre: string;
  apellido: string;
  correo: string;
  codigo_estudiantil: string;
  id_equipo: number;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface VideojuegoData {
  id_videojuego: number;
  nombre: string;
  descripcion: string;
  logo_url: string;
  video_url: string | null;
  archivos: string[];
  fecha_registro: string;
  id_estado_videojuego: number;
  id_equipo: number;
  activo: boolean;
}

export interface NrcInfo {
  id_nrc: number;
  codigo: number;
  id_materia: number;
  id_profesor: string;
}

export interface MateriaInfo {
  id_materia: number;
  nombre: string;
  codigo: string;
  semestre: number;
}
