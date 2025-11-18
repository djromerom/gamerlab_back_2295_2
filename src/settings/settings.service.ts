import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly CONFIG_ID = 1;

  async getEvaluationsOpen(): Promise<{
    evaluationsOpen: boolean;
    endDate: Date;
  }> {
    const cfg = await this.prisma.eventConfiguration.findFirst({
      where: { id: this.CONFIG_ID }, // Assuming there's only one configuration entry
      select: { endDate: true, evaluationsOpen: true },
    });

    if (!cfg) {
      throw new NotFoundException('Event configuration not found');
    }

    return {
      evaluationsOpen: cfg.evaluationsOpen,
      endDate: cfg.endDate,
    };
  }
}
