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
  evaluatedCount: number;
  evaluatedGameNames: string[];
  unevaluatedCount: number;
  unevaluatedGameNames: string[];
}