export class JurorListItem {
  id: string;
  name: string | null;
  email: string;
  confirmationStatusId: number;
  updatedAt: Date;
  _count: {
    evaluationsSubmitted: number;
  };
}
