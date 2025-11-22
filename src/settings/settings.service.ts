import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvaluationsOpen(): Promise<{
    evaluationsOpen: boolean;
    endDate: Date;
  }> {
    const currentEdition = await this.prisma.edition.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    if (!currentEdition) {
      throw new NotFoundException('There is not an active edition');
    }

    const cfg = await this.prisma.eventConfiguration.findUnique({
      where: { editionId: currentEdition.id },
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
}
