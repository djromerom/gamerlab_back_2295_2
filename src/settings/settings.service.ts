import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventConfiguration } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvaluationsOpen(): Promise<{
    evaluationsOpen: boolean;
    endDate: Date;
  }> {
    const activeCnfgInfo = await this.getActiveConfig();

    return {
      evaluationsOpen: activeCnfgInfo.evaluationsOpen,
      endDate: activeCnfgInfo.endDate,
    };
  }

  async updateEvaluationStatus(
    open: boolean,
  ): Promise<{ evaluationsOpen: boolean; endDate: Date }> {
    if (!open) throw new BadRequestException("Missing 'open' parameter");
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { evaluationsOpen: open },
      select: { evaluationsOpen: true, endDate: true },
    });

    return updated;
  }

  async getShowRanking(): Promise<{ showRanking: boolean }> {
    const activeCnfg = await this.getActiveConfig();
    return { showRanking: activeCnfg.showRanking };
  }

  async setShowRanking(show: boolean): Promise<{ showRanking: boolean }> {
    if (!show) throw new BadRequestException("Missing 'show' parameter");
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { showRanking: show },
      select: { showRanking: true },
    });

    return updated;
  }

  async getShowEvaluation(): Promise<{ showEvaluations: boolean }> {
    const activeCnfg = await this.getActiveConfig();
    return { showEvaluations: activeCnfg.showEvaluations };
  }

  async setShowEvaluation(
    show: boolean,
  ): Promise<{ showEvaluations: boolean }> {
    if (!show) throw new BadRequestException("Missing 'show' parameter");
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { showEvaluations: show },
      select: { showEvaluations: true },
    });
    return updated;
  }

  private async getActiveConfig(): Promise<EventConfiguration> {
    const activeCnfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: { isActive: true } },
    });
    if (!activeCnfg)
      throw new NotFoundException(
        'A configuration for the active edition was not found',
      );

    return activeCnfg;
  }
}
