export class JurorListItem {
  id: string;
  name: string;
  LastName: string | null;
  email: string;
  confirmationStatusId: number | null;
  lastSignInAt: Date | null;
  evaluatedCount: number;
  evaluatedGameNames: string[];
  unevaluatedCount: number;
  unevaluatedGameNames: string[];
}

