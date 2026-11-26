import type { DiplomaContent, DiplomaKind } from './diploma.logic';
import { joinStudentNames } from './certificate-content';
import type { ExternalPresenterCertificateData } from './external-presenter-certificate';
import { fairRomanOf } from './fair-name';

/**
 * ARK-309: qué dice cada diploma. Los textos son los de los certificados actuales; el podio y la
 * participación comparten plantilla y solo cambia la frase y el acento.
 */
const PODIUM = {
  1: {
    kind: 'oro',
    kicker: 'La Universidad del Norte otorga el primer puesto al equipo',
  },
  2: {
    kind: 'plata',
    kicker: 'La Universidad del Norte otorga el segundo puesto al equipo',
  },
  3: {
    kind: 'bronce',
    kicker: 'La Universidad del Norte otorga el tercer puesto al equipo',
  },
} satisfies Record<number, { kind: DiplomaKind; kicker: string }>;

export interface JurorDiplomaData {
  jurorName: string;
  fairName: string;
  placeAndDate: string;
}

export interface TeamDiplomaData {
  teamName: string;
  gameName: string;
  memberNames: string[];
  fairName: string;
  placeAndDate: string;
}

export function jurorDiploma(data: JurorDiplomaData): DiplomaContent {
  return {
    kind: 'jurado',
    kicker: 'Se certifica que',
    name: data.jurorName,
    line: `Participó como jurado en la ${data.fairName}`,
    placeAndDate: data.placeAndDate,
    edition: fairRomanOf(data.fairName),
  };
}

/** `place` 1, 2 o 3 es el podio; cualquier otro valor, el certificado de participación. */
export function teamDiploma(
  data: TeamDiplomaData,
  place: number,
): DiplomaContent {
  const podium = PODIUM[place as keyof typeof PODIUM];
  const common = {
    name: data.teamName,
    sub: `Compuesto por ${joinStudentNames(data.memberNames)}`,
    placeAndDate: data.placeAndDate,
    edition: fairRomanOf(data.fairName),
  };
  if (podium) {
    return {
      ...common,
      kind: podium.kind,
      kicker: podium.kicker,
      line: `En la ${data.fairName}, con su videojuego ${data.gameName}`,
    };
  }
  return {
    ...common,
    kind: 'equipo',
    kicker: 'Se certifica al equipo',
    line: `Por su participación en la ${data.fairName} con su videojuego ${data.gameName}`,
  };
}

export function presenterDiploma(
  data: ExternalPresenterCertificateData,
): DiplomaContent {
  return {
    kind: 'externo',
    kicker: 'Se certifica que',
    name: data.presenterName,
    sub: data.organization ?? undefined,
    line: `Asistió como presentador externo a la ${data.editionTitle}`,
    talk: data.presentationTitle
      ? `Con la presentación ${data.presentationTitle}`
      : undefined,
    placeAndDate: data.placeAndDate,
    edition: fairRomanOf(data.editionTitle),
  };
}
