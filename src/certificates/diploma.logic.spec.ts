import fs from 'fs';
import path from 'path';
import { loadDiplomaAssets } from './diploma-assets';
import { jurorDiploma, presenterDiploma, teamDiploma } from './diploma-content';
import { DiplomaContent, renderDiplomaHtml } from './diploma.logic';

const WHERE = 'Barranquilla, 26 de noviembre de 2026';
const TEAM = {
  teamName: 'Los Pixeles',
  gameName: 'Pixel Quest',
  memberNames: ['Sofía Ruiz', 'Mateo Díaz'],
  fairName: 'VI Feria Gamer',
  placeAndDate: WHERE,
};
const template = fs.readFileSync(
  path.join(__dirname, 'assets', 'diploma.html'),
  'utf8',
);

/** El HTML sin las fuentes e imágenes incrustadas (en base64 puede haber cualquier cosa). */
const textOf = (html: string) => html.replace(/data:[^)"']+/g, 'data:');

describe('HTML del diploma (ARK-309)', () => {
  let render: (content: DiplomaContent) => string;

  beforeAll(async () => {
    const assets = await loadDiplomaAssets();
    render = (content) => renderDiplomaHtml(template, content, assets);
  });

  const juror = jurorDiploma({
    jurorName: 'Ana Ruiz',
    fairName: 'VI Feria Gamer',
    placeAndDate: WHERE,
  });
  const all: [string, DiplomaContent][] = [
    ['jurado', juror],
    ['equipo', teamDiploma(TEAM, 0)],
    ['podio 1', teamDiploma(TEAM, 1)],
    ['podio 2', teamDiploma(TEAM, 2)],
    ['podio 3', teamDiploma(TEAM, 3)],
    [
      'presentador externo',
      presenterDiploma({
        presenterName: 'Carlos Vega',
        organization: 'Estudio',
        presentationTitle: 'Charla',
        editionTitle: 'VI Feria Gamer',
        placeAndDate: WHERE,
      }),
    ],
  ];

  describe.each(all)('diploma de %s', (_name, content) => {
    it('llena todas las variables y no depende de internet', () => {
      const html = textOf(render(content));
      expect(html).not.toMatch(/{{\s*[\w.]+\s*}}/);
      // fuentes e imágenes van incrustadas: ningún enlace externo (Azure, Google Fonts...)
      expect(html).not.toMatch(/https?:\/\//);
      expect(html).toContain(content.name);
      expect(html).toContain(WHERE);
      expect(html).toContain('VI EDICIÓN');
      expect(html).toContain('Universidad del Norte');
    });

    it('lleva solo dos firmas, primero la del Director de Departamento', () => {
      const html = textOf(render(content));
      expect(html.match(/class="sig"/g)).toHaveLength(2);
      expect(html.indexOf('Daladier Jabba')).toBeGreaterThan(-1);
      expect(html.indexOf('Daladier Jabba')).toBeLessThan(
        html.indexOf('Daniel Romero Martínez'),
      );
      expect(html.indexOf('Director de Departamento')).toBeLessThan(
        html.indexOf('Arquitecto de Software de Arkad'),
      );
    });

    it('incrusta las fuentes y el logo de la universidad', () => {
      const html = render(content);
      expect(html).toContain('data:font/woff2;base64,');
      expect(html).toMatch(/class="uninorte" src="data:image\/png;base64,/);
    });
  });

  it('la medalla va solo en el podio', () => {
    expect(render(teamDiploma(TEAM, 1))).toContain('alt="Medalla de oro"');
    expect(render(teamDiploma(TEAM, 2))).toContain('alt="Medalla de plata"');
    expect(render(teamDiploma(TEAM, 3))).toContain('alt="Medalla de bronce"');
    expect(render(teamDiploma(TEAM, 0))).not.toContain('class="medal"');
    expect(render(teamDiploma(TEAM, 1))).toContain('data-t="oro"');
    expect(render(teamDiploma(TEAM, 1))).toContain('data-medal="1"');
    expect(render(teamDiploma(TEAM, 0))).not.toContain('data-medal="1"');
  });

  it('escapa lo que escribe el usuario', () => {
    const html = render({
      ...teamDiploma(TEAM, 0),
      name: '<script>alert(1)</script>',
      sub: 'A & "B"',
      line: '{{ name }}',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; &quot;B&quot;');
    // un {{ x }} escrito por el usuario no se vuelve a interpretar
    expect(html).toContain('<p class="line">{{ name }}</p>');
  });

  it('sin número de edición no lleva «VI EDICIÓN» ni el «VI» grande', () => {
    const html = render(
      jurorDiploma({
        jurorName: 'Ana',
        fairName: 'Taller de verano',
        placeAndDate: WHERE,
      }),
    );
    expect(html).not.toContain('EDICIÓN</span>');
    expect(html).not.toContain('<div class="vi">');
  });

  it('con número de edición muestra «VI EDICIÓN» y el «VI» grande', () => {
    const html = render(juror);
    expect(html).toContain('<span>VI EDICIÓN</span>');
    expect(html).toContain('<div class="vi">VI</div>');
  });

  it('los textos del folleto salen del código y se pueden vaciar', async () => {
    const assets = await loadDiplomaAssets();
    const empty = renderDiplomaHtml(template, juror, assets, {
      theme: '',
      hudLeft: '',
      hudRight: '',
    });
    expect(empty).toContain('<div class="theme"></div>');
    const normal = render(juror);
    expect(normal).toContain('Uso saludable de las redes sociales');
    expect(normal).toContain('Lo que ves no siempre es real.');
  });
});
