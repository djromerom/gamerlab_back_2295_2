/**
 * ARK-309: fondo del diploma, un suelo en perspectiva azul con puntos y un horizonte que brilla.
 * Es SVG propio (sin imágenes externas) y no depende de ningún dato.
 */
const WIDTH = 1123;
const HEIGHT = 794;
const HORIZON_Y = 468;
const LINE_COLOR = '#4d86ff';
const DOT_COLOR = '#7aa5ff';
const GLOW_COLOR = '#3b78ff';
const HORIZON_COLOR = '#6fa0ff';
const FLOOR_SHADE = '#050a22';

export function diplomaBackgroundSvg(): string {
  const centerX = WIDTH / 2;
  let lines = '';
  for (let i = -16; i <= 16; i++) {
    lines += `<line x1="${centerX + i * 30}" y1="${HORIZON_Y}" x2="${centerX + i * 190}" y2="${HEIGHT}" stroke="${LINE_COLOR}" stroke-opacity=".26" stroke-width="1"/>`;
  }
  for (let k = 1; k <= 10; k++) {
    const y = HORIZON_Y + (HEIGHT - HORIZON_Y) * Math.pow(k / 10, 2.1);
    lines += `<line x1="0" y1="${y.toFixed(1)}" x2="${WIDTH}" y2="${y.toFixed(1)}" stroke="${LINE_COLOR}" stroke-opacity="${(0.12 + (0.22 * k) / 10).toFixed(2)}" stroke-width="1"/>`;
  }
  return (
    `<svg class="grid" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true"><defs>` +
    `<pattern id="px" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="${DOT_COLOR}" fill-opacity=".28"/></pattern>` +
    `<radialGradient id="hz" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${GLOW_COLOR}" stop-opacity=".5"/><stop offset="1" stop-color="${GLOW_COLOR}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FLOOR_SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${FLOOR_SHADE}" stop-opacity=".5"/></linearGradient></defs>` +
    `<rect width="${WIDTH}" height="${HORIZON_Y}" fill="url(#px)"/>` +
    `<ellipse cx="${centerX}" cy="${HORIZON_Y}" rx="620" ry="120" fill="url(#hz)"/>` +
    `<line x1="0" y1="${HORIZON_Y}" x2="${WIDTH}" y2="${HORIZON_Y}" stroke="${HORIZON_COLOR}" stroke-opacity=".55" stroke-width="1.2"/>` +
    lines +
    `<rect y="${HORIZON_Y}" width="${WIDTH}" height="${HEIGHT - HORIZON_Y}" fill="url(#fl)"/></svg>`
  );
}
