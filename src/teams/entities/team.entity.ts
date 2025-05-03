// src/teams/entities/team.entity.ts
export class Team {
    id: number;
    nombre_equipo: string;  // Mapeado a "nombre_equipo" en Supabase
    fecha_registro: Date;
    estado_confirmacion: boolean;
    userId: string;  // ID del usuario creador (sin relación aún)
    editionId: string;  // ID de la edición (sin relación aún)
  }