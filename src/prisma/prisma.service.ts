import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // El código de verificación (HU-19) nunca se devuelve por defecto: solo sale si la consulta
    // lo pide con `select: { verificationCode: true }`. Así no se filtra en listados ni a los jurados.
    super({ omit: { team: { verificationCode: true } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
