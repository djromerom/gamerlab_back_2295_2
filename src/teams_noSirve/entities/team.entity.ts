// src/teams/entities/team.entity.ts
export class Team {
    id: number;
    nombre_equipo: string;
    fecha_registro: Date;
    estado_confirmacion: boolean;
    userId: string;
    editionId: string;
  }