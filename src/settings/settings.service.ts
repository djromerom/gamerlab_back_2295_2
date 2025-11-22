import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvaluationsOpen(): Promise<{
    evaluationsOpen: boolean;
    endDate: Date;
  }> {
    const cfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: { isActive: true } },
      select: { evaluationsOpen: true, endDate: true },
    });

    if (!cfg)
      throw new NotFoundException(
        'A configuration for this edition was not found',
      );

    return {
      evaluationsOpen: cfg.evaluationsOpen,
      endDate: cfg.endDate,
    };
  }

  async updateEvaluationStatus(
    open: boolean,
  ): Promise<{ evaluationsOpen: boolean; endDate: Date }> {
    const cfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: { isActive: true } },
      select: { id: true },
    });
    if (!cfg)
      throw new NotFoundException(
        'A configuration for the active edition was not found',
      );

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: cfg.id },
      data: { evaluationsOpen: open },
      select: { evaluationsOpen: true, endDate: true },
    });

    return {
      evaluationsOpen: updated.evaluationsOpen,
      endDate: updated.endDate,
    };
  }
}
