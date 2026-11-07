import { isAllowedPushEndpoint } from './push-endpoint-policy';

describe('isAllowedPushEndpoint (HU-37)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/QGv1abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ['sin https', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['otro host', 'https://evil.example.com/abc'],
    ['host interno', 'https://localhost/abc'],
    ['IP de metadatos', 'https://169.254.169.254/latest/meta-data'],
    ['sufijo engañoso', 'https://fcm.googleapis.com.evil.com/abc'],
    ['dominio parecido', 'https://evilpush.apple.com/abc'],
    ['credenciales', 'https://user:pw@fcm.googleapis.com/abc'],
    ['truco de credenciales', 'https://fcm.googleapis.com@evil.com/abc'],
    ['otro puerto', 'https://fcm.googleapis.com:8443/abc'],
    ['no es una URL', 'no-es-url'],
  ])('rechaza %s', (_name, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
