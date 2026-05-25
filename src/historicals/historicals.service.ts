import { Injectable, NotFoundException, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHistoricalDto } from './dto/create-historical.dto';
import { UpdateHistoricalDto } from './dto/update-historical.dto';
import { HistoricalTeams, HistoricalMembers, HistoricalVideogames } from '@prisma/client';

@Injectable()
export class HistoricalsService {
  private readonly logger = new Logger(HistoricalsService.name);
  
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  create(createHistoricalDto: CreateHistoricalDto) {
    return 'This action adds a new historical';
  }

  findAll() {
    return `This action returns all historicals`;
  }

  findOne(id: number) {
    return `This action returns a #${id} historical`;
  }

  update(id: number, updateHistoricalDto: UpdateHistoricalDto) {
    return `This action updates a #${id} historical`;
  }

  remove(id: number) {
    return `This action removes a #${id} historical`;
  }
}
