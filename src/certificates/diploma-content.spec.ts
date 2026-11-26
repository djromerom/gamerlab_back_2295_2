import { jurorDiploma, presenterDiploma, teamDiploma } from './diploma-content';

const WHERE = 'Barranquilla, 26 de noviembre de 2026';
const TEAM = {
  teamName: 'Los Pixeles',
  gameName: 'Pixel Quest',
  memberNames: ['Sofía Ruiz', 'Mateo Díaz', 'Valentina Mora'],
  fairName: 'VI Feria Gamer',
  placeAndDate: WHERE,
};

describe('qué dice cada diploma (ARK-309)', () => {
  it('jurado', () => {
    expect(
      jurorDiploma({
        jurorName: 'Ana Ruiz',
        fairName: 'VI Feria Gamer',
        placeAndDate: WHERE,
      }),
    ).toEqual({
      kind: 'jurado',
      kicker: 'Se certifica que',
      name: 'Ana Ruiz',
      line: 'Participó como jurado en la VI Feria Gamer',
      placeAndDate: WHERE,
      edition: 'VI',
    });
  });

  it('participación del equipo: integrantes y videojuego', () => {
    expect(teamDiploma(TEAM, 0)).toMatchObject({
      kind: 'equipo',
      kicker: 'Se certifica al equipo',
      name: 'Los Pixeles',
      sub: 'Compuesto por Sofía Ruiz, Mateo Díaz y Valentina Mora',
      line: 'Por su participación en la VI Feria Gamer con su videojuego Pixel Quest',
    });
  });

  it.each([
    [1, 'oro', 'primer'],
    [2, 'plata', 'segundo'],
    [3, 'bronce', 'tercer'],
  ])('podio del puesto %i: acento %s', (place, kind, word) => {
    const diploma = teamDiploma(TEAM, place);
    expect(diploma.kind).toBe(kind);
    expect(diploma.kicker).toBe(
      `La Universidad del Norte otorga el ${word} puesto al equipo`,
    );
    // la feria y la fecha se dicen una sola vez
    expect(diploma.line).toBe(
      'En la VI Feria Gamer, con su videojuego Pixel Quest',
    );
    expect(diploma.placeAndDate).toBe(WHERE);
  });

  it('presentador externo: organización y presentación sin comillas', () => {
    const diploma = presenterDiploma({
      presenterName: 'Carlos Vega',
      organization: 'Estudio Nube Verde',
      presentationTitle: 'Del prototipo al lanzamiento',
      editionTitle: 'VI Feria Gamer',
      placeAndDate: WHERE,
    });
    expect(diploma).toMatchObject({
      kind: 'externo',
      name: 'Carlos Vega',
      sub: 'Estudio Nube Verde',
      line: 'Asistió como presentador externo a la VI Feria Gamer',
      talk: 'Con la presentación Del prototipo al lanzamiento',
    });
  });

  it('presentador sin organización ni presentación no deja líneas vacías', () => {
    const diploma = presenterDiploma({
      presenterName: 'Carlos Vega',
      organization: null,
      presentationTitle: null,
      editionTitle: 'VI Feria Gamer',
      placeAndDate: WHERE,
    });
    expect(diploma.sub).toBeUndefined();
    expect(diploma.talk).toBeUndefined();
  });

  it('si el periodo no es una feria, el diploma no lleva número de edición', () => {
    const diploma = jurorDiploma({
      jurorName: 'Ana',
      fairName: 'Taller de verano',
      placeAndDate: WHERE,
    });
    expect(diploma.edition).toBeNull();
  });
});
