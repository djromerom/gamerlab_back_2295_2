import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventConfiguration, EditionStatus } from '@prisma/client';
import { CreateWeightDto } from './dto/create-weight.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getByEdition(editionId?: number) {
    // If no editionId is provided, resolve the latest edition ID internally
    let id = editionId;
    if (!id) {
      const latest = await this.prisma.edition.findFirst({ orderBy: { id: 'desc' } });
      id = latest?.id ?? 1;
    }
    return this.prisma.weighting.findUnique({ where: { editionId: id } });
  }

  async getLatest() {
    const latest = await this.prisma.edition.findFirst({ orderBy: { id: 'desc' } });
    const editionId = latest?.id ?? 1;
    return this.getByEdition(editionId);
  }

  async upsertWeights(dto: CreateWeightDto) {
    // Optional: validate that the percentages sum to 100 or normalize them.
    // Although the frontend performs this check, we validate on the server
    // to avoid inconsistent data if the request is made directly to the API.
    const sum = dto.seniorPct + dto.juniorPct;
    if (sum !== 100) {
      // Throw a BadRequest so the client can correct the values.
      // Alternatively, you could normalize the values automatically:
      // dto.seniorPct = Math.round((dto.seniorPct / sum) * 100);
      // dto.juniorPct = 100 - dto.seniorPct;
      throw new BadRequestException('The sum of seniorPct and juniorPct must equal 100');
    }
    // determine editionId: use provided one or fallback to latest edition
    const latest = await this.prisma.edition.findFirst({ orderBy: { id: 'desc' } });
    const editionId = dto.editionId ?? latest?.id ?? 1;

    return this.prisma.weighting.upsert({
      where: { editionId },
      update: { seniorPct: dto.seniorPct, juniorPct: dto.juniorPct },
      create: { editionId, seniorPct: dto.seniorPct, juniorPct: dto.juniorPct },
    });
  }

  async getEvaluationsOpen(): Promise<{
    evaluationsOpen: boolean;
  }> {
    const activeCnfgInfo = await this.getActiveConfig();

    return {
      evaluationsOpen: activeCnfgInfo.evaluationsOpen,
    };
  }

  async updateEvaluationStatus(
    open: boolean,
  ): Promise<{ evaluationsOpen: boolean }> {
    if (open === undefined || open === null)
      throw new BadRequestException("Missing 'open' parameter");
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { evaluationsOpen: open },
      select: { evaluationsOpen: true },
    });

    return updated;
  }

  async getShowRanking(): Promise<{ showRanking: boolean }> {
    const activeCnfg = await this.getActiveConfig();
    return { showRanking: activeCnfg.showRanking };
  }

  async setShowRanking(show: boolean): Promise<{ showRanking: boolean }> {
    if (show === undefined || show === null)
      throw new BadRequestException("Missing 'show' parameter");
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
    if (show === undefined || show === null)
      throw new BadRequestException("Missing 'show' parameter");
    const activeCnfg = await this.getActiveConfig();

    const updated = await this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { showEvaluations: show },
      select: { showEvaluations: true },
    });
    return updated;
  }

  // Sin configuración de la edición activa se considera cerrada: la lee el front público y no debe fallar con 404
  async getRegistrationsOpen(): Promise<{ registrationsOpen: boolean }> {
    const activeCnfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: { status: EditionStatus.ACTIVE } },
      select: { registrationsOpen: true },
    });
    return { registrationsOpen: activeCnfg?.registrationsOpen ?? false };
  }

  async setRegistrationsOpen(open: boolean): Promise<{ registrationsOpen: boolean }> {
    if (typeof open !== 'boolean')
      throw new BadRequestException("Missing 'open' parameter");
    const activeCnfg = await this.getActiveConfig();

    return this.prisma.eventConfiguration.update({
      where: { id: activeCnfg.id },
      data: { registrationsOpen: open },
      select: { registrationsOpen: true },
    });
  }

  private async getActiveConfig(): Promise<EventConfiguration> {
    const activeCnfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: { status: EditionStatus.ACTIVE } },
    });
    if (!activeCnfg)
      throw new NotFoundException(
        'A configuration for the active edition was not found',
      );

    return activeCnfg;
  }
}
