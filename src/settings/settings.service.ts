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
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { evaluationsOpen: open },
      select: { evaluationsOpen: true, endDate: true },
    });

    return updated;
  }

  async setShowRanking(show: boolean): Promise<{ showRanking: boolean }> {
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { showRanking: show },
      select: { showRanking: true },
    });

    return updated;
  }

  async setShowEvaluation(
    show: boolean,
  ): Promise<{ showEvaluations: boolean }> {
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { showEvaluations: show },
      select: { showEvaluations: true },
    });

    return updated;
  }

  private async getActiveConfig() {
    const activeCnfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: { isActive: true } },
      select: { id: true },
    });
    if (!activeCnfg)
      throw new NotFoundException(
        'A configuration for the active edition was not found',
      );

    return activeCnfg;
  }
}
