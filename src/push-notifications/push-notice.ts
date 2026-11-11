import { BadRequestException } from '@nestjs/common';

/**
 * HU-37: contenido de un aviso push. Es lo único que viaja al dispositivo y lo que recibe el
 * service worker del frontend. Toda notificación pasa por `buildPushNotice`, también las que
 * envíen los disparadores automáticos cuando se conecten: este es el único punto de control.
 */
export interface PushNotice {
  title: string;
  body: string;
  /** Ruta interna que se abre al tocar el aviso. */
  url: string;
}

export type PushNoticeInput = Pick<PushNotice, 'title' | 'body'> & {
  url?: string;
};

export const PUSH_TITLE_MAX_LENGTH = 60;
export const PUSH_BODY_MAX_LENGTH = 200;
export const PUSH_URL_MAX_LENGTH = 200;

/** El aviso se ve en la pantalla bloqueada: no puede llevar correos ni códigos. */
export const PUSH_NOTICE_SENSITIVE_DATA = 'PUSH_NOTICE_SENSITIVE_DATA';
export const PUSH_NOTICE_INVALID = 'PUSH_NOTICE_INVALID';

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Códigos estudiantiles y cédulas (6 dígitos o más seguidos) y teléfonos con separadores.
// Una fecha como 26-11-2026 tiene 8 dígitos con separadores y no entra.
const DOCUMENT_OR_PHONE_PATTERN = /\d{6,}|(?:\d[ .-]?){10,}/;
// Solo rutas internas: un aviso no debe poder sacar al jurado de ARKAD.
const INTERNAL_PATH_PATTERN = /^\/(?!\/)[A-Za-z0-9\-._~/?=&%#]*$/;

function invalid(code: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, code, message });
}

/** Limpia y valida un aviso. 400 si está vacío, es muy largo o lleva datos sensibles. */
export function buildPushNotice(input: PushNoticeInput): PushNotice {
  const title = input.title?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  const url = input.url?.trim() || '/';

  if (!title || !body) {
    throw invalid(PUSH_NOTICE_INVALID, 'El aviso necesita título y mensaje');
  }
  if (
    title.length > PUSH_TITLE_MAX_LENGTH ||
    body.length > PUSH_BODY_MAX_LENGTH
  ) {
    throw invalid(
      PUSH_NOTICE_INVALID,
      `El título admite ${PUSH_TITLE_MAX_LENGTH} caracteres y el mensaje ${PUSH_BODY_MAX_LENGTH}`,
    );
  }
  if (url.length > PUSH_URL_MAX_LENGTH || !INTERNAL_PATH_PATTERN.test(url)) {
    throw invalid(
      PUSH_NOTICE_INVALID,
      'La dirección debe ser una ruta interna de ARKAD, por ejemplo /jurado',
    );
  }
  const text = `${title} ${body}`;
  if (EMAIL_PATTERN.test(text) || DOCUMENT_OR_PHONE_PATTERN.test(text)) {
    throw invalid(
      PUSH_NOTICE_SENSITIVE_DATA,
      'El aviso se ve en la pantalla bloqueada: no incluyas correos, códigos, documentos ni teléfonos',
    );
  }

  return { title, body, url };
}
