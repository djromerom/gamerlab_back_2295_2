export type AuthEmailType = 'VERIFICACION_EMAIL' | 'RESETEAR_CONTRASENA';

export const AUTH_EMAIL_CONFIG: Record<
  AuthEmailType,
  { template: string; subject: string }
> = {
  VERIFICACION_EMAIL: {
    template: 'verification',
    subject: 'Verifica tu cuenta en Gamerlab',
  },
  RESETEAR_CONTRASENA: {
    template: 'reset_password',
    subject: 'Restablece tu contraseña - Gamerlab',
  },
};
