import type { DiplomaAssets } from './diploma-assets';
import { diplomaBackgroundSvg } from './diploma-background';
import { escapeHtml } from './external-presenter-certificate';

/** Tipo de diploma: decide el color de acento y la medalla. */
export type DiplomaKind =
  | 'jurado'
  | 'equipo'
  | 'externo'
  | 'oro'
  | 'plata'
  | 'bronce';

export interface DiplomaContent {
  kind: DiplomaKind;
  /** «Se certifica que», «Se certifica al equipo»… */
  kicker: string;
  name: string;
  /** Integrantes o organización, bajo el nombre. */
  sub?: string;
  line: string;
  /** Título de la presentación del presentador externo. */
  talk?: string;
  /** «Barranquilla, 26 de noviembre de 2026». */
  placeAndDate: string;
  /** «VI» de «VI Feria Gamer»; `null` si el periodo no es una feria (sin «VI EDICIÓN» ni «VI» grande). */
  edition: string | null;
}

/**
 * Textos del folleto de la edición que aparecen fijos en el diploma. Son de la VI Feria Gamer:
 * para otra edición se cambian aquí (o se dejan vacíos y el diploma los oculta).
 */
export interface DiplomaEditionTexts {
  theme: string;
  hudLeft: string;
  hudRight: string;
}

export const DIPLOMA_EDITION_TEXTS: DiplomaEditionTexts = {
  theme: 'Uso saludable de las redes sociales',
  hudLeft: 'Lo que ves no siempre es real.',
  hudRight: 'Lo que vives, sí.',
};

const MEDAL_IMAGE = {
  oro: 'medalGold',
  plata: 'medalSilver',
  bronce: 'medalBronze',
} as const;
const MEDAL_ALT = {
  oro: 'Medalla de oro',
  plata: 'Medalla de plata',
  bronce: 'Medalla de bronce',
} as const;

const STAR =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 12.4 7.6 20 10 12.4 12.4 10 20 7.6 12.4 0 10 7.6 7.6Z"/></svg>';

/**
 * ARK-309: arma el HTML del diploma. Todo lo que escribe un usuario (nombres, equipo, juego,
 * organización) se escapa aquí: el HTML lo renderiza Chromium (Gotenberg) y un nombre con `<` no
 * debe romper ni inyectar nada en el PDF. Los valores se insertan en una sola pasada, así que un
 * `{{ x }}` dentro de un nombre queda como texto.
 */
export function renderDiplomaHtml(
  template: string,
  content: DiplomaContent,
  assets: DiplomaAssets,
  texts: DiplomaEditionTexts = DIPLOMA_EDITION_TEXTS,
): string {
  const medal =
    content.kind in MEDAL_IMAGE
      ? (content.kind as keyof typeof MEDAL_IMAGE)
      : null;
  const values: Record<string, string> = {
    fontsCss: assets.fontsCss,
    kind: content.kind,
    medalAttr: medal ? 'data-medal="1"' : '',
    background: diplomaBackgroundSvg(),
    numeralBlock: content.edition
      ? `<div class="vi">${escapeHtml(content.edition)}</div>`
      : '',
    editionBlock: content.edition
      ? `<div class="edition">${STAR}<span>${escapeHtml(content.edition)} EDICIÓN</span>${STAR}</div>`
      : '',
    hudLeft: escapeHtml(texts.hudLeft),
    hudRight: escapeHtml(texts.hudRight),
    theme: escapeHtml(texts.theme),
    medalBlock: medal
      ? `<img class="medal" src="${assets.images[MEDAL_IMAGE[medal]]}" alt="${MEDAL_ALT[medal]}" />`
      : '',
    kicker: escapeHtml(content.kicker),
    name: escapeHtml(content.name),
    subBlock: content.sub
      ? `<div class="sub">${escapeHtml(content.sub)}</div>`
      : '',
    line: escapeHtml(content.line),
    talkBlock: content.talk
      ? `<div class="talk">${escapeHtml(content.talk)}</div>`
      : '',
    placeAndDate: escapeHtml(content.placeAndDate),
    'img.uninorte': assets.images.uninorte,
    'img.arkad': assets.images.arkad,
    'img.signatureDaladier': assets.images.signatureDaladier,
    'img.signatureDaniel': assets.images.signatureDaniel,
  };
  return template.replace(
    /{{\s*([\w.]+)\s*}}/g,
    (_, key: string) => values[key] ?? '',
  );
}
