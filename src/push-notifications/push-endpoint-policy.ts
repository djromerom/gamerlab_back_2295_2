/**
 * HU-37: el servidor hace un POST a la dirección que el navegador entrega al suscribirse. Sin
 * esta lista, un usuario con sesión podría hacer que el backend llame a cualquier host (SSRF).
 *
 * Solo se aceptan los servicios de push de los navegadores: Chrome, Edge y Samsung en Android
 * (FCM), Safari en iPhone (Apple), Firefox (Mozilla) y Edge en Windows (WNS).
 */
const EXACT_HOSTS = ['fcm.googleapis.com'];
const HOST_SUFFIXES = [
  '.push.apple.com',
  '.push.services.mozilla.com',
  '.notify.windows.com',
];

export const PUSH_ENDPOINT_NOT_ALLOWED = 'PUSH_ENDPOINT_NOT_ALLOWED';

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false;
  }
  return (
    EXACT_HOSTS.includes(url.hostname) ||
    HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}
