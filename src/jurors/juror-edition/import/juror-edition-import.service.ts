import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { JurorCategory, JurorEditionStatus } from '@prisma/client';
import { findUserByEmailCaseInsensitive } from 'src/common/utils/find-user-by-email';
import { JurorService } from 'src/jurors/juror/juror.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { assertWritable, resolveEdition } from '../edition-resolver';
import { assertEnrollable } from '../juror-edition-enroll';
import { JurorEditionImportMailQueue } from './juror-edition-import-mail.queue';
import {
  classifyAccount,
  isInvalidRow,
  summarize,
  validateImportRows,
  ValidImportRow,
} from './juror-edition-import.logic';
import {
  ImportJurorsReport,
  ImportRowReport,
} from './juror-edition-import.types';
import { readImportRows } from './juror-edition-import.xlsx';

/** Lo que una fila procesada aporta al informe (sin los datos que ya trae la fila). */
type RowOutcome = Pick<
  ImportRowReport,
  'result' | 'accountCreated' | 'emailStatus' | 'error' | 'message'
>;

/**
 * HU-49 (ARK-280): importa desde un Excel la lista de jurados de la edición activa. Cada fila
 * se procesa por separado: una que falla queda en el informe y no frena a las demás.
 */
@Injectable()
export class JurorEditionImportService {
  private readonly logger = new Logger(JurorEditionImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jurors: JurorService,
    private readonly mailQueue: JurorEditionImportMailQueue,
  ) {}

  async import(file: Buffer, actorId: string): Promise<ImportJurorsReport> {
    // Solo la edición activa (sin `editionId`): así lo pide el ticket.
    const edition = await resolveEdition(this.prisma);
    assertWritable(edition);

    // Si el archivo no sirve (no es xlsx, sin columnas, demasiadas filas) lanza 400 sin importar nada.
    const validated = validateImportRows(await readImportRows(file));

    const rows: ImportRowReport[] = [];
    const emails: string[] = [];
    for (const item of validated) {
      if (isInvalidRow(item)) {
        rows.push({
          row: item.row,
          email: item.email,
          firstName: item.firstName,
          lastName: item.lastName,
          type: item.type,
          result: 'ERROR',
          accountCreated: false,
          emailStatus: 'NOT_NEEDED',
          error: item.error,
          message: item.message,
        });
        continue;
      }
      const outcome = await this.importRow(item, edition.id, actorId);
      if (outcome.emailStatus === 'QUEUED') emails.push(item.email);
      rows.push({
        row: item.row,
        email: item.email,
        firstName: item.firstName,
        lastName: item.lastName,
        type: item.type,
        ...outcome,
      });
    }

    // Los correos salen después, con pausa (BG-74); la respuesta no espera.
    this.mailQueue.enqueue(emails);

    return {
      edition: { id: edition.id, title: edition.title },
      summary: summarize(rows),
      rows,
    };
  }

  private async importRow(
    row: ValidImportRow,
    editionId: number,
    actorId: string,
  ): Promise<RowOutcome> {
    try {
      const account = await findUserByEmailCaseInsensitive(
        this.prisma,
        row.email,
        { role: true, confirmationStatus: true },
      );
      const action = classifyAccount(
        account && {
          isActive: account.isActive,
          roleName: account.role.name,
          verificationStatus: account.confirmationStatus?.status ?? null,
        },
      );

      if (action.kind === 'ERROR') {
        return failed(action.error, action.message);
      }
      if (action.kind === 'CREATE' || !account) {
        return await this.createAccountAndConfirm(row, editionId, actorId);
      }
      const emailStatus = action.resendVerification ? 'QUEUED' : 'NOT_NEEDED';
      try {
        await assertEnrollable(this.prisma, account, editionId);
      } catch (error) {
        if (error instanceof ConflictException) {
          // Profesor con NRC activo en la edición: ya es jurado automático, no se le crea fila.
          return {
            result: 'ALREADY_CONFIRMED',
            accountCreated: false,
            emailStatus: 'NOT_NEEDED',
            message: 'Es profesor con NRC activo en la edición: ya es jurado',
          };
        }
        throw error;
      }
      const confirmed = await this.confirm(row, account.id, editionId, actorId);
      return {
        result: confirmed ? 'CONFIRMED' : 'ALREADY_CONFIRMED',
        accountCreated: false,
        emailStatus,
      };
    } catch (error) {
      this.logger.error(
        `Fila ${row.row} de la importación de jurados: ${error instanceof Error ? error.message : String(error)}`,
      );
      return failed(
        'UNEXPECTED',
        'No se pudo procesar la fila. Intente importarla de nuevo.',
      );
    }
  }

  private async createAccountAndConfirm(
    row: ValidImportRow,
    editionId: number,
    actorId: string,
  ): Promise<RowOutcome> {
    let jurorId: string;
    try {
      // Mismo alta que Personal → Jurados, pero sin enviar el correo aquí: lo manda la cola.
      const created = await this.jurors.create(
        {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          jurorCategory: JurorCategory.JUNIOR,
          jurorType: row.type,
        },
        { sendVerificationEmail: false },
      );
      jurorId = created.id;
    } catch (error) {
      this.logger.error(
        `Fila ${row.row}: no se pudo crear la cuenta: ${error instanceof Error ? error.message : String(error)}`,
      );
      return failed(
        'ACCOUNT_CREATION_FAILED',
        'No se pudo crear la cuenta del jurado. Intente importarla de nuevo.',
      );
    }
    await this.confirm(row, jurorId, editionId, actorId);
    return { result: 'CREATED', accountCreated: true, emailStatus: 'QUEUED' };
  }

  /**
   * Deja al jurado Confirmado en la edición, con el tipo del Excel. Devuelve `false` si ya
   * estaba Confirmado (no se toca ni se duplica); `true` si hubo que crear o cambiar la fila.
   */
  private async confirm(
    row: ValidImportRow,
    jurorId: string,
    editionId: number,
    actorId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.jurorEdition.findUnique({
      where: { jurorId_editionId: { jurorId, editionId } },
      select: { status: true },
    });
    if (existing?.status === JurorEditionStatus.CONFIRMED) return false;

    await this.prisma.jurorEdition.upsert({
      where: { jurorId_editionId: { jurorId, editionId } },
      create: {
        jurorId,
        editionId,
        status: JurorEditionStatus.CONFIRMED,
        type: row.type,
        updatedById: actorId,
      },
      update: {
        status: JurorEditionStatus.CONFIRMED,
        type: row.type,
        updatedById: actorId,
      },
      select: { id: true },
    });
    return true;
  }
}

function failed(
  error: NonNullable<ImportRowReport['error']>,
  message: string,
): RowOutcome {
  return {
    result: 'ERROR',
    accountCreated: false,
    emailStatus: 'NOT_NEEDED',
    error,
    message,
  };
}
