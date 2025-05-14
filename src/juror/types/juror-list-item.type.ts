export class JurorListItem {
  id: string;
  name: string | null;
  email: string;
  confirmationStatusId: number;
  lastSignInAt: Date;
  _count: {
    evaluationsSubmitted: number;
  };
}
