import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWeightDto } from './dto/create-weight.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getByEdition(editionId: number) {
    return this.prisma.weighting.findUnique({ where: { editionId } });
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
    return this.prisma.weighting.upsert({
      where: { editionId: dto.editionId },
      update: { seniorPct: dto.seniorPct, juniorPct: dto.juniorPct },
      create: { editionId: dto.editionId, seniorPct: dto.seniorPct, juniorPct: dto.juniorPct },
    });
  }
}