import { BadRequestException } from '@nestjs/common';
import {
  buildPushNotice,
  PUSH_NOTICE_INVALID,
  PUSH_NOTICE_SENSITIVE_DATA,
} from './push-notice';

const codeOf = (input: Parameters<typeof buildPushNotice>[0]) => {
  try {
    buildPushNotice(input);
    return 'sin error';
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { code: string })
      .code;
  }
};

describe('buildPushNotice (HU-37)', () => {
  it('limpia los espacios y usa la raíz si no hay ruta', () => {
    expect(buildPushNotice({ title: ' Hola ', body: ' Mensaje ' })).toEqual({
      title: 'Hola',
      body: 'Mensaje',
      url: '/',
    });
  });

  it('solo deja salir título, mensaje y ruta', () => {
    const extra = {
      title: 'Hola',
      body: 'Mensaje',
      email: 'alguien@uninorte.edu.co',
    };
    expect(Object.keys(buildPushNotice(extra))).toEqual([
      'title',
      'body',
      'url',
    ]);
  });

  it.each([
    ['un título vacío', { title: '   ', body: 'x' }],
    ['un mensaje vacío', { title: 'x', body: '' }],
    ['un título largo', { title: 'x'.repeat(61), body: 'x' }],
    ['un mensaje largo', { title: 'x', body: 'x'.repeat(201) }],
    ['una URL externa', { title: 'x', body: 'x', url: 'https://malo.com' }],
    ['una ruta a otro host', { title: 'x', body: 'x', url: '//malo.com' }],
    ['una barra invertida', { title: 'x', body: 'x', url: '/\\malo.com' }],
    ['javascript:', { title: 'x', body: 'x', url: 'javascript:alert(1)' }],
  ])('rechaza %s', (_name, input) => {
    expect(codeOf(input)).toBe(PUSH_NOTICE_INVALID);
  });

  it.each([
    ['un correo', 'Escribe a jurado@uninorte.edu.co'],
    ['un código estudiantil', 'El estudiante 200123456 no llegó'],
    ['un teléfono con espacios', 'Llama al 300 123 4567'],
    ['un teléfono con guiones', 'Llama al 300-123-4567'],
  ])('rechaza %s', (_name, body) => {
    expect(codeOf({ title: 'Aviso', body })).toBe(PUSH_NOTICE_SENSITIVE_DATA);
  });

  it('también revisa el título', () => {
    expect(codeOf({ title: 'a@b.co', body: 'x' })).toBe(
      PUSH_NOTICE_SENSITIVE_DATA,
    );
  });

  it.each([
    'La feria es el 26-11-2026 a las 10:30 a. m.',
    'Revisa el NRC 12345 en el salón 2-101',
  ])('acepta fechas, horas y números cortos: %s', (body) => {
    expect(codeOf({ title: 'Aviso', body })).toBe('sin error');
  });

  it('acepta una ruta interna con parámetros', () => {
    expect(
      buildPushNotice({ title: 'x', body: 'x', url: '/jurado?tab=1#lista' })
        .url,
    ).toBe('/jurado?tab=1#lista');
  });
});
