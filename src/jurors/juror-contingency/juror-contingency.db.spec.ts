import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckInMethod,
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { EmailService } from 'src/email/email.service';
import { fairInstant } from 'src/jurors/absence-alert/fair-schedule';
import { FairScheduleService } from 'src/jurors/absence-alert/fair-schedule.service';
import { JurorPresenceService } from 'src/jurors/juror-presence/juror-presence.service';
import { JurorAssignmentAuditService } from 'src/jurors/juror/assignment-audit/juror-assignment-audit.service';
import { AssignmentValidationService } from 'src/jurors/juror/assignment-validation/assignment-validation.service';
import { SubstituteNoticesService } from 'src/jurors/substitute-notices/substitute-notices.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AssignmentPushNotifier } from 'src/push-notifications/assignment-push-notifier.service';
import { ContingencyAssignmentService } from './contingency-assignment.service';
import { JurorContingencyService } from './juror-contingency.service';
import { CONTINGENCY_AUDIT_NOTE } from './types/juror-contingency.types';

/**
 * HU-14 (ARK-213) contra Postgres real: grupo en riesgo a las 11:30, sugerencia, rechazo,
 * aceptación (solo suma, bitácora y aviso de HU-22) y jurado que llega tarde.
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Usa la edición
 * activa y deja su cronograma como estaba.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-14: contingencia con suplentes (BD real)', () => {
  const prisma = new PrismaService();
  const tag = randomUUID().slice(0, 6);
  const FAIR_DATE = '2096-03-02';
  const now = new Date(fairInstant(FAIR_DATE, '11:30'));

  const schedules = new FairScheduleService(prisma);
  const contingency = new JurorContingencyService(
    prisma,
    schedules,
    new JurorPresenceService(prisma),
    new AssignmentValidationService(prisma),
  );
  const notices = new SubstituteNoticesService(
    prisma,
    {} as EmailService,
    { get: () => undefined } as unknown as ConfigService,
  );
  notices.sendEmailAfterCommit = jest.fn();
  const push = {
    notifyAssignmentChanged: jest.fn(),
    notifyTeamsAssigned: jest.fn(),
  };
  const assignments = new ContingencyAssignmentService(
    prisma,
    contingency,
    new AssignmentValidationService(prisma),
    new JurorAssignmentAuditService(prisma),
    notices,
    push as unknown as AssignmentPushNotifier,
  );

  let editionId = 0;
  let previousSchedule: Awaited<
    ReturnType<typeof prisma.fairSchedule.findUnique>
  > = null;
  const ids: Record<string, string> = {};
  let teamId = 0;
  let leftTeamId = 0;

  const user = async (
    key: string,
    role: string,
    enrollment?: { type: JurorType; category: JurorCategory },
  ) => {
    const { id: roleId } = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu14.test`,
        firstName: key,
        lastName: `HU14 ${tag}`,
        roleId,
        jurorCategory: enrollment?.category ?? null,
      },
      select: { id: true },
    });
    if (enrollment) {
      await prisma.jurorEdition.create({
        data: {
          jurorId: created.id,
          editionId,
          type: enrollment.type,
          status: JurorEditionStatus.CONFIRMED,
        },
      });
    }
    ids[key] = created.id;
    return created.id;
  };
  const checkIn = (key: string) =>
    prisma.jurorAttendance.create({
      data: {
        jurorId: ids[key],
        editionId,
        checkedInById: ids.admin,
        method: CheckInMethod.MANUAL,
        checkedInAt: new Date(fairInstant(FAIR_DATE, '08:30')),
        // Respondió «Sigo aquí» hace poco: no cuenta como retirado (HU-23)
        lastPresenceConfirmedAt: new Date(fairInstant(FAIR_DATE, '11:25')),
      },
    });
  const assignedTo = async (id: number) =>
    (
      await prisma.team.findUniqueOrThrow({
        where: { id },
        select: { assignedJurors: { select: { id: true } } },
      })
    ).assignedJurors.map((j) => j.id);
  const groupOf = async () =>
    (await contingency.getSuggestions(now)).grupos.find(
      (g) => g.teamId === teamId,
    );

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findFirstOrThrow({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    editionId = active.id;
    previousSchedule = await prisma.fairSchedule.findUnique({
      where: { editionId },
    });
    const times = {
      startTime: '08:00',
      alertTime: '10:00',
      controlTime: '11:00',
      closeTime: '12:00',
    };
    await prisma.fairSchedule.upsert({
      where: { editionId },
      create: {
        editionId,
        fairDate: new Date(`${FAIR_DATE}T00:00:00Z`),
        ...times,
      },
      update: { fairDate: new Date(`${FAIR_DATE}T00:00:00Z`), ...times },
    });

    await user('admin', 'Administrador');
    const official = {
      type: JurorType.OFFICIAL,
      category: JurorCategory.JUNIOR,
    };
    for (const key of ['ausente', 'b', 'c'])
      await user(key, 'Jurado', official);
    await user('s1', 'Jurado', {
      type: JurorType.BACKUP,
      category: JurorCategory.JUNIOR,
    });
    await user('s2', 'Jurado', {
      type: JurorType.BACKUP,
      category: JurorCategory.SENIOR,
    });
    for (const key of ['b', 'c', 's1', 's2']) await checkIn(key);
    // Llegó a las 8:30, no ha enviado nada ni respondió «Sigo aquí»: se retiró (HU-23)
    await user('retirado', 'Jurado', official);
    await prisma.jurorAttendance.create({
      data: {
        jurorId: ids.retirado,
        editionId,
        checkedInById: ids.admin,
        method: CheckInMethod.MANUAL,
        checkedInAt: new Date(fairInstant(FAIR_DATE, '08:30')),
      },
    });

    const status = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const team = await prisma.team.create({
      data: {
        teamName: `E ${tag}`,
        teamCode: `N1-${tag}`,
        userId: await user('lider', 'Estudiante'),
        editionId,
        videogame: {
          create: { name: `J ${tag}`, videogameStatusId: status.id },
        },
        assignedJurors: {
          connect: ['ausente', 'b', 'c'].map((key) => ({ id: ids[key] })),
        },
      },
      select: { id: true },
    });
    teamId = team.id;
    leftTeamId = (
      await prisma.team.create({
        data: {
          teamName: `R ${tag}`,
          teamCode: `N1-R${tag}`,
          userId: await user('lider2', 'Estudiante'),
          editionId,
          videogame: {
            create: { name: `R ${tag}`, videogameStatusId: status.id },
          },
          assignedJurors: {
            connect: ['retirado', 'b', 'c'].map((key) => ({ id: ids[key] })),
          },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      const userIds = Object.values(ids);
      await prisma.substituteSuggestionRejection.deleteMany({
        where: { teamId },
      });
      await prisma.jurorAssignmentAuditLog.deleteMany({ where: { teamId } });
      const noticeIds = (
        await prisma.substituteNotice.findMany({
          where: { jurorId: { in: userIds } },
          select: { id: true },
        })
      ).map((n) => n.id);
      await prisma.substituteNoticeTeam.deleteMany({
        where: { noticeId: { in: noticeIds } },
      });
      await prisma.substituteNotice.deleteMany({
        where: { id: { in: noticeIds } },
      });
      await prisma.team.deleteMany({
        where: { id: { in: [teamId, leftTeamId] } },
      });
      await prisma.jurorAttendance.deleteMany({
        where: { jurorId: { in: userIds } },
      });
      await prisma.jurorEdition.deleteMany({
        where: { jurorId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      if (previousSchedule) {
        const {
          id: _id,
          createdAt: _c,
          updatedAt: _u,
          ...rest
        } = previousSchedule;
        await prisma.fairSchedule.update({ where: { editionId }, data: rest });
      } else {
        await prisma.fairSchedule.deleteMany({ where: { editionId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('a las 11:30 el grupo con un jurado sin llegada queda en riesgo', async () => {
    const result = await contingency.getGroupsAtRisk(now);
    expect(result).toMatchObject({
      fase: 'CONTROL',
      base: 'PRESENT',
      minimoEvaluaciones: 3,
    });
    const group = result.grupos.find((g) => g.teamId === teamId);
    expect(group).toMatchObject({ juradosContados: 2, faltantes: 1 });
    expect(group!.jurados.find((j) => j.id === ids.ausente)?.estado).toBe(
      'ABSENT',
    );
  });

  it('sugiere al suplente de la misma categoría que el ausente (junior)', async () => {
    const group = await groupOf();
    expect(group!.sugeridos.map((s) => s.id)).toEqual([ids.s1]);
    expect(group!.alternativas.map((s) => s.id)).toEqual([ids.s2]);
  });

  it('rechazar deja registro y ese suplente no se vuelve a sugerir para el grupo', async () => {
    const result = await assignments.reject(
      { teamId, reason: 'Prefiero al senior' },
      ids.admin,
      now,
    );
    expect(result.suplentesRechazados.map((s) => s.id)).toEqual([ids.s1]);
    expect(
      await prisma.substituteSuggestionRejection.findMany({
        where: { teamId },
        select: { substituteId: true, reason: true, rejectedById: true },
      }),
    ).toEqual([
      {
        substituteId: ids.s1,
        reason: 'Prefiero al senior',
        rejectedById: ids.admin,
      },
    ]);

    const group = await groupOf();
    expect(group!.sugeridos.map((s) => s.id)).toEqual([ids.s2]);
    expect(group!.alternativas).toEqual([
      expect.objectContaining({ id: ids.s1, rechazado: true }),
    ]);
  });

  it('solo un suplente confirmado de la edición se puede aceptar', async () => {
    await expect(
      assignments.accept(
        { assignments: [{ teamId, substituteId: ids.b }] },
        ids.admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceptar suma al suplente sin quitar a nadie, con bitácora y aviso', async () => {
    const pairs = { assignments: [{ teamId, substituteId: ids.s2 }] };
    // El grupo pasaría a 4 jurados con uno ausente: puede haber advertencias de HU-08
    let result;
    try {
      result = await assignments.accept(pairs, ids.admin);
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      result = await assignments.accept(
        { ...pairs, confirmWarnings: true },
        ids.admin,
      );
    }
    expect(result.totales).toEqual({
      asignacionesAgregadas: 1,
      asignacionesOmitidas: 0,
    });

    expect((await assignedTo(teamId)).sort()).toEqual(
      [ids.ausente, ids.b, ids.c, ids.s2].sort(),
    );
    const log = await prisma.jurorAssignmentAuditLog.findFirstOrThrow({
      where: { teamId, jurorId: ids.s2 },
    });
    expect(log.notes).toContain(CONTINGENCY_AUDIT_NOTE);
    expect(log.actorUserId).toBe(ids.admin);
    expect(
      await prisma.substituteNotice.count({
        where: { jurorId: ids.s2, editionId },
      }),
    ).toBe(1);
    expect(push.notifyTeamsAssigned).toHaveBeenCalledWith([
      { jurorId: ids.s2, teamId },
    ]);

    // Ya cubierto: sale de los grupos en riesgo
    expect(
      (await contingency.getGroupsAtRisk(now)).grupos.some(
        (g) => g.teamId === teamId,
      ),
    ).toBe(false);
  });

  it('repetir la aceptación no duplica nada', async () => {
    const result = await assignments.accept(
      { assignments: [{ teamId, substituteId: ids.s2 }] },
      ids.admin,
    );
    expect(result.totales).toEqual({
      asignacionesAgregadas: 0,
      asignacionesOmitidas: 1,
    });
  });

  it('quien se retiró (sin actividad y sin responder «Sigo aquí») deja de contar', async () => {
    const group = (await contingency.getGroupsAtRisk(now)).grupos.find(
      (g) => g.teamId === leftTeamId,
    );
    expect(group).toMatchObject({ juradosContados: 2, faltantes: 1 });
    expect(group!.jurados.find((j) => j.id === ids.retirado)).toMatchObject({
      estado: 'LEFT',
      cuenta: false,
    });
    // Los que sí respondieron «Sigo aquí» siguen contando aunque no hayan enviado nada
    expect(group!.jurados.find((j) => j.id === ids.b)).toMatchObject({
      estado: 'PRESENT',
      cuenta: true,
    });
    // Conserva su grupo: nadie se lo quita
    expect(await assignedTo(leftTeamId)).toContain(ids.retirado);
  });

  it('el jurado que llega tarde conserva su grupo y vuelve a contar', async () => {
    await checkIn('ausente');
    expect(await assignedTo(teamId)).toContain(ids.ausente);
    const status = (await contingency.getGroupsAtRisk(now)).grupos.find(
      (g) => g.teamId === teamId,
    );
    expect(status).toBeUndefined();
  });
});
