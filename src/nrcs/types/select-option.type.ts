export class SelectOption {
  id: number;
  code: number;
  subjectId: number;
  editionId: number;
  /** Con `includeSubjects=true`. `abrevName` es la abreviatura de 3 letras (HU-31). */
  subject?: { id: number; name: string; abrevName: string };
  /** Con `includeSubjects=true`: nombre y apellido del profesor del NRC (HU-31). */
  professorName?: string;
}
