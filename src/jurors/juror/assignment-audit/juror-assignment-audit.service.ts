import { Injectable, Logger } from '@nestjs/common';
import { ManualJurorAssignmentAction, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface CreateJurorAssignmentAuditInput {
  action: ManualJurorAssignmentAction;
  actorUserId: string;
  teamId?: number | null;
  jurorId?: string | null;
  previousJurorId?: string | null;
  newJurorId?: string | null;
  notes?: string | null;
}

@Injectable()
export class JurorAssignmentAuditService {
  private readonly logger = new Logger(JurorAssignmentAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateJurorAssignmentAuditInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    try {
      return await client.jurorAssignmentAuditLog.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          teamId: input.teamId ?? null,
          jurorId: input.jurorId ?? null,
          previousJurorId: input.previousJurorId ?? null,
          newJurorId: input.newJurorId ?? null,
          notes: input.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar auditoría de asignación manual: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}