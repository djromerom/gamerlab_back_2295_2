export class JurorListItem {
  id: string;
  firstname: string;
  lastname: string | null;
  email: string;
  confirmationStatusId: number | null;
  lastSignInAt: Date | null;
  evaluatedCount: number;
  evaluatedGameNames: string[];
  unevaluatedCount: number;
  unevaluatedGameNames: string[];
}

