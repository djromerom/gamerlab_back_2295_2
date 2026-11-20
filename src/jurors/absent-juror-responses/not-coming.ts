import { AbsentJurorResponseResult } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * HU-44 (ARK-293): jurados que «No podrán asistir» (ausente confirmado).
 *
 * Un jurado no vendrá si su **última** respuesta de HU-13 en la edición es `CANNOT_ATTEND` y no
 * hizo check-in después de registrarla. Reglas (decisión de Allison del 19-nov):
 * - «Viene en camino» y «Sin respuesta» siguen siendo informativas: si se registran después, el
 *   jurado vuelve a «Faltan por llegar».
 * - Un check-in posterior (aunque luego se anule) deja la respuesta sin efecto: el jurado llegó.
 * - Con una llegada activa el jurado está presente, sin importar sus respuestas.
 * - No toca asignaciones ni borra el historial: solo dice quién no vendrá.
 */
export interface NotComingResponse {
  id: number;
  jurorId: string;
  result: AbsentJurorResponseResult;
  recordedAt: Date;
}

export interface NotComingAttendance {
  jurorId: string;
  checkedInAt: Date;
  isActive: boolean;
}

/** Jurado → hora en que se registró su «No podrá asistir» vigente. */
export function notComingSince(
  responses: NotComingResponse[],
  attendances: NotComingAttendance[],
): Map<string, Date> {
  const latest = new Map<string, NotComingResponse>();
  for (const response of responses) {
    const current = latest.get(response.jurorId);
    if (
      !current ||
      response.recordedAt.getTime() > current.recordedAt.getTime() ||
      (response.recordedAt.getTime() === current.recordedAt.getTime() &&
        response.id > current.id)
    ) {
      latest.set(response.jurorId, response);
    }
  }

  const result = new Map<string, Date>();
  for (const [jurorId, response] of latest) {
    if (response.result !== AbsentJurorResponseResult.CANNOT_ATTEND) continue;
    const arrived = attendances.some(
      (a) =>
        a.jurorId === jurorId &&
        (a.isActive ||
          a.checkedInAt.getTime() >= response.recordedAt.getTime()),
    );
    if (!arrived) result.set(jurorId, response.recordedAt);
  }
  return result;
}

/** Lo mismo leyendo la base: los jurados que no vendrán en la edición. */
export async function loadNotComing(
  prisma: PrismaService,
  editionId: number,
): Promise<Map<string, Date>> {
  const responses = await prisma.absentJurorResponse.findMany({
    where: { editionId },
    select: { id: true, jurorId: true, result: true, recordedAt: true },
  });
  if (responses.length === 0) return new Map();
  const attendances = await prisma.jurorAttendance.findMany({
    where: {
      editionId,
      jurorId: { in: [...new Set(responses.map((r) => r.jurorId))] },
    },
    select: { jurorId: true, checkedInAt: true, isActive: true },
  });
  return notComingSince(responses, attendances);
}
