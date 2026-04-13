export type CertEmailType =
  | 'PARTICIPATION_CERTIFICATE'
  | '1ST_PLACE_CERTIFICATE'
  | '2ND_PLACE_CERTIFICATE'
  | '3RD_PLACE_CERTIFICATE';

export const CERT_EMAIL_CONFIG: Record<
  CertEmailType,
  { template: string; subject: string; certIndex: number }
> = {
  PARTICIPATION_CERTIFICATE: {
    template: 'participation_certificate',
    subject: 'Tu Certificado de Participación - Gamerlab',
    certIndex: 0,
  },
  '1ST_PLACE_CERTIFICATE': {
    template: '1st_place_certificate',
    subject: '¡Felicidades! Ganadores del 1er Lugar - Gamerlab',
    certIndex: 1,
  },
  '2ND_PLACE_CERTIFICATE': {
    template: '2nd_place_certificate',
    subject: '¡Felicidades! Ganadores del 2do Lugar - Gamerlab',
    certIndex: 2,
  },
  '3RD_PLACE_CERTIFICATE': {
    template: '3rd_place_certificate',
    subject: '¡Felicidades! Ganadores del 3er Lugar - Gamerlab',
    certIndex: 3,
  },
};
