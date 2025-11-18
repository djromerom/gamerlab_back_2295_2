import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvaluationsOpen(): Promise<{
    evaluationsOpen: boolean;
    endDate: Date;
  }> {
    const cfg = await this.prisma.eventConfiguration.findFirst({
      where: { id: 1 }, // Assuming there's only one configuration entry
      select: { endDate: true, evaluationsOpen: true },
    });

    return {
      evaluationsOpen: cfg!.evaluationsOpen,
      endDate: cfg!.endDate,
    };
  }
}
