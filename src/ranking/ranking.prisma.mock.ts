/**
 * Prisma en memoria para las pruebas del ranking (HU-04, HU-38): la edición, las filas de
 * `vw_team_final_scores`, los equipos, las decisiones de empate y el resultado guardado. La vista
 * y las consultas reales se prueban en test/ranking.e2e-spec.ts.
 */
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
export const EDITION = 3;
const prof = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Prof',
});
export const PA = prof('pa', 'Ana');
export const PB = prof('pb', 'Beto');

export function scoreRow(
  teamId: number,
  teamCode: string,
  finalScore: number | null,
) {
  return {
    teamId,
    teamCode,
    teamName: `Equipo ${teamId}`,
    isExternal: false,
    videogameId: teamId * 10,
    videogameName: `Juego ${teamId}`,
    videogameLogoUrl: null,
    editionId: EDITION,
    avgJunior: finalScore,
    avgSenior: finalScore,
    finalScore,
    juniorEvaluations: 3,
    juniorCounted: 3,
    seniorEvaluations: 1,
    weightingConfigured: true,
  };
}

export function team(id: number, day: number, professors: any[]) {
  return {
    id,
    registrationDate: new Date(Date.UTC(2026, 10, day)),
    isActive: true,
    members: [{ nrcs: professors.map((p) => ({ professor: p })) }],
  };
}

export function makePrisma() {
  const state = {
    rows: [
      scoreRow(1, 'N1-A-1', 4.5),
      scoreRow(2, 'N1-A-2', 4.5), // empate 1-2: mismo profesor (PA)
      scoreRow(3, 'N2-A-1', 4),
      scoreRow(4, 'N2-A-2', 4), // empate 3-4: profesores distintos
      scoreRow(5, 'N2-A-3', 3),
    ],
    teams: [
      team(1, 5, [PA]),
      team(2, 2, [PA]),
      team(3, 9, [PA]),
      team(4, 1, [PB]),
      team(5, 3, [PB]),
    ],
    decisions: [] as any[],
    results: [] as any[],
  };
  const prisma: any = {
    edition: {
      findFirst: jest.fn().mockResolvedValue({ id: EDITION }),
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(where.id === EDITION ? { id: EDITION } : null),
      ),
    },
    teamFinalScore: { findMany: jest.fn(() => Promise.resolve(state.rows)) },
    team: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          state.teams.filter((t) => !where.id || where.id.in.includes(t.id)),
        ),
      ),
    },
    weighting: {
      findUnique: jest.fn().mockResolvedValue({ juniorPct: 40, seniorPct: 60 }),
    },
    rankingResult: {
      findMany: jest.fn(() => Promise.resolve(state.results)),
      deleteMany: jest.fn(() => {
        state.results = [];
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(({ data }) => {
        state.results.push(
          ...data.map((d: any) => ({ ...d, updatedAt: new Date() })),
        );
        return Promise.resolve({ count: data.length });
      }),
    },
    tieBreakDecision: {
      findMany: jest.fn(() => Promise.resolve(state.decisions)),
      create: jest.fn(({ data }) => {
        const created = {
          id: state.decisions.length + 1,
          createdAt: new Date(),
          ...data,
        };
        const author = [
          PA,
          PB,
          { id: 'admin', firstName: 'Admin', lastName: '' },
        ].find((u) => u.id === data.decidedById);
        state.decisions.push({ ...created, decidedBy: author });
        return Promise.resolve(created);
      }),
      createMany: jest.fn(({ data }) => {
        data.forEach((d: any) =>
          state.decisions.push({
            id: state.decisions.length + 1,
            createdAt: new Date(),
            decidedBy: { id: d.decidedById, firstName: 'Admin', lastName: '' },
            ...d,
          }),
        );
        return Promise.resolve({ count: data.length });
      }),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return { prisma, state };
}
