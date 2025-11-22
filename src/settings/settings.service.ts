import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
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
}