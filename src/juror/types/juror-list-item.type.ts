import { JurorCategory, JurorType } from '@prisma/client';

export class JurorListItem {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  confirmationStatusId: number | null;
  lastSignInAt: Date | null;
  jurorCategory: JurorCategory | null;
  jurorType: JurorType | null;
  /** true si es un profesor: su categoría es siempre Senior (ARK-139). */
  isProfessor: boolean;
  evaluatedCount: number;
  evaluatedGameNames: string[];
  unevaluatedCount: number;
  unevaluatedGameNames: string[];
}