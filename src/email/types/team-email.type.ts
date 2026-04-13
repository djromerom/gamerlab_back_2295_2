export type TeamEmailType =
  | 'UPDATE_VIDEOGAME_INFO'
  | 'VIDEOGAME_APPROVED'
  | 'VIDEOGAME_REJECTED';

export const TEAM_EMAIL_CONFIG: Record<
  TeamEmailType,
  { template: string; subject: string }
> = {
  UPDATE_VIDEOGAME_INFO: {
    template: 'update_videogame_info',
    subject: 'Actualización de Videojuego - Gamerlab',
  },
  VIDEOGAME_APPROVED: {
    template: 'videogame_approved',
    subject: '¡Videojuego Aprobado! - Gamerlab',
  },
  VIDEOGAME_REJECTED: {
    template: 'videogame_rejected',
    subject: 'Estado de Videojuego: Rechazado - Gamerlab',
  },
};
