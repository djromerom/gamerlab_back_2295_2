import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventConfiguration, EditionStatus } from '@prisma/client';
import { CreateWeightDto } from './dto/create-weight.dto';
import {
  ACTIVE_EDITION_WHERE,
  assertEditionWritable,
  requireActiveEdition,
} from '../editions/active-edition';

/** Código del 404 cuando la edición aún no tiene ponderados. */
export const WEIGHTS_NOT_CONFIGURED = 'WEIGHTS_NOT_CONFIGURED';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ponderados de una edición; sin `editionId`, los de la edición activa (ARK-130: antes era «la de
   * id más alto», que puede ser una edición recién creada e inactiva).
   * Siempre responde JSON (antes un `null` salía como 200 con cuerpo vacío y el front fallaba):
   * - sin edición activa: 404 `NO_ACTIVE_EDITION`;
   * - la edición no tiene ponderados: 404 `WEIGHTS_NOT_CONFIGURED`.
   */
  async getByEdition(editionId?: number) {
    const id = editionId || (await requireActiveEdition(this.prisma)).id;
    const weighting = await this.prisma.weighting.findUnique({ where: { editionId: id } });
    if (!weighting) {
      throw new NotFoundException({
        statusCode: 404,
        code: WEIGHTS_NOT_CONFIGURED,
        message: `La edición ${id} no tiene ponderados configurados.`,
      });
    }
    return weighting;
  }

  /** Ponderados de la edición activa (la ruta conserva el nombre «latest»). */
  async getLatest() {
    return this.getByEdition();
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
    // ARK-130 (HU-27): por defecto la edición activa; los ponderados de una edición anterior
    // son historial y no se cambian (cambiarían notas finales ya publicadas).
    const edition = dto.editionId
      ? await this.prisma.edition.findUnique({
          where: { id: dto.editionId },
          select: { id: true, status: true, title: true },
        })
      : await requireActiveEdition(this.prisma);
    if (!edition) {
      throw new NotFoundException(`La edición ${dto.editionId} no existe`);
    }
    assertEditionWritable(edition, 'los ponderados');
    const editionId = edition.id;

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

  /**
   * Regla de visibilidad pública del ranking: sin configuración de edición ACTIVE
   * (periodo entre ediciones) se considera oculto, en lugar de lanzar 404.
   * `getShowRanking` conserva su contrato.
   */
  async isRankingVisible(): Promise<boolean> {
    const cfg = await this.prisma.eventConfiguration.findFirst({
      where: { edition: ACTIVE_EDITION_WHERE },
      select: { showRanking: true },
    });
    return cfg?.showRanking === true;
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
      where: { edition: ACTIVE_EDITION_WHERE },
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
      where: { edition: ACTIVE_EDITION_WHERE },
    });
    if (!activeCnfg)
      throw new NotFoundException(
        'A configuration for the active edition was not found',
      );

    return activeCnfg;
  }
}
