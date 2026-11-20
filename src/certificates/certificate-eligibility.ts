import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActiveEdition } from '../editions/active-edition';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';

/** ARK-170 (TA-19): el estado de aprobación del equipo es el de su videojuego. */
export const CERTIFIABLE_VIDEOGAME_STATUS = 'CONFIRMADO';

export const CERTIFICATE_TEAM_NOT_FOUND = 'CERTIFICATE_TEAM_NOT_FOUND';
export const CERTIFICATE_TEAM_NOT_CONFIRMED = 'CERTIFICATE_TEAM_NOT_CONFIRMED';
export const CERTIFICATE_TEAM_WITHOUT_MEMBERS =
  'CERTIFICATE_TEAM_WITHOUT_MEMBERS';

type ScheduleClient = { fairSchedule: Pick<Prisma.FairScheduleDelegate, 'findUnique'> };
type UserClient = { user: Pick<Prisma.UserDelegate, 'findFirst'> };

/** Colombia está en UTC-5 todo el año; las horas de la edición se capturan en esa zona. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * El día del evento, a medianoche UTC (como `fecha_feria`): el del cronograma de la edición (HU-12)
 * o, si no se ha configurado, el día en que empieza la edición, que siempre existe. En ferias
 * anteriores es la fecha de sus certificados (27/11/2025 y 28/05/2026).
 */
export async function eventDayOf(
  prisma: ScheduleClient,
  edition: { id: number; startsAt: Date },
): Promise<Date> {
  const schedule = await prisma.fairSchedule.findUnique({
    where: { editionId: edition.id },
    select: { fairDate: true },
  });
  if (schedule?.fairDate) return schedule.fairDate;
  const local = new Date(edition.startsAt.getTime() - BOGOTA_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

/** ARK-135 (BG-22): solo se certifica a quien participa en la edición activa (HU-25). */
export async function assertJurorOfEdition(
  prisma: UserClient,
  edition: Pick<ActiveEdition, 'id' | 'title'>,
  userId: string,
  jurorName: string,
): Promise<void> {
  const participates = await prisma.user.findFirst({
    where: jurorsOfEdition(edition.id, [userId]),
    select: { id: true },
  });
  if (!participates) {
    throw new BadRequestException(
      `${jurorName} no participa en «${edition.title}»: solo se certifica a los jurados de la edición activa.`,
    );
  }
}
