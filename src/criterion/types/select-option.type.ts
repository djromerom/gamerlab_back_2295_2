export class SelectOption {
  id: number;
  name: string;
  weight: number | null; // TODO: Update the schema.prisma to make this required
  description: string | null; // TODO: Update the schema.prisma to make this required
}
