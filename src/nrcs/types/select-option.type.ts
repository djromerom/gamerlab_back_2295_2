export class SelectOption {
  id: number;
  code: number;
  subjectId: number;
  editionId: number;
  subject?: { id: number, name: string }
}
