import { isSeniorEvaluator } from '../assignment-validation/assignment-rules';
import {
  AutoAssignmentAlert,
  AutoAssignmentPlan,
  LevelCoverage,
  PlannedAssignment,
  PlannedJuror,
  PlannedTeam,
  PlannedTeamJuror,
  PlannerEvaluator,
  PlannerInput,
  PlannerJuror,
  PlannerTeam,
} from './automatic-assignment.types';

/** Estado final de un equipo que deja el planificador. */
export interface FinalTeam {
  team: PlannerTeam;
  level: number;
  jurorIds: string[];
}

/** Estado final de un jurado que deja el planificador. */
export interface FinalJuror {
  juror: PlannerJuror;
  load: number;
  level: number | null;
}

interface BuildPlanArgs {
  input: PlannerInput;
  teams: FinalTeam[];
  jurors: FinalJuror[];
  added: PlannedAssignment[];
  alerts: AutoAssignmentAlert[];
}

export const levelLabel = (level: number) =>
  level === 0 ? 'Colegios (N0)' : `Universitarios N${level}`;

/** HU-07: arma la vista previa (cobertura, alertas y distribución) del plan. */
export function buildPlan(args: BuildPlanArgs): AutoAssignmentPlan {
  const { input, added } = args;
  const target = input.limits.jurorsPerTeam;

  const evaluators = new Map<string, PlannerEvaluator>();
  for (const team of input.teams) {
    for (const e of team.assigned) evaluators.set(e.id, e);
  }
  for (const juror of input.jurors) evaluators.set(juror.id, juror);

  const addedKeys = new Set(added.map((a) => `${a.teamId}:${a.jurorId}`));
  const teams: PlannedTeam[] = args.teams.map(({ team, level, jurorIds }) => {
    const jurors = jurorIds.map((id): PlannedTeamJuror => {
      const e = evaluators.get(id)!;
      return {
        id,
        name: e.name,
        kind: e.kind,
        jurorCategory: e.jurorCategory,
        fixed: !addedKeys.has(`${team.id}:${id}`),
      };
    });
    return {
      id: team.id,
      teamCode: team.teamCode,
      teamName: team.teamName,
      level,
      jurors,
      complete: jurors.length >= target,
      hasSenior: jurors.some(isSeniorEvaluator),
    };
  });

  const newByJuror = new Map<string, number>();
  for (const a of added) {
    newByJuror.set(a.jurorId, (newByJuror.get(a.jurorId) ?? 0) + 1);
  }
  const jurors: PlannedJuror[] = args.jurors.map(({ juror, load, level }) => {
    const gained = newByJuror.get(juror.id) ?? 0;
    return {
      id: juror.id,
      name: juror.name,
      kind: juror.kind,
      jurorCategory: juror.jurorCategory,
      level: load > 0 ? level : null,
      teamsBefore: load - gained,
      teamsAfter: load,
    };
  });

  const alerts = [...args.alerts, ...coverageAlerts(teams, target)];
  const levels = levelCoverage(teams, jurors, target);

  return {
    limits: input.limits,
    assignments: added,
    summary: {
      teams: teams.length,
      completeTeams: teams.filter((t) => t.complete).length,
      incompleteTeams: teams.filter((t) => !t.complete).length,
      teamsWithoutSenior: teams.filter((t) => t.level !== 0 && !t.hasSenior)
        .length,
      newAssignments: added.length,
      availableJurors: input.jurors.length,
      jurorsWithNewTeams: newByJuror.size,
    },
    levels,
    teams,
    jurors,
    alerts,
  };
}

function coverageAlerts(
  teams: PlannedTeam[],
  target: number,
): AutoAssignmentAlert[] {
  const alerts: AutoAssignmentAlert[] = [];

  const schoolMissing = teams
    .filter((t) => t.level === 0)
    .reduce((sum, t) => sum + Math.max(0, target - t.jurors.length), 0);
  if (schoolMissing > 0) {
    alerts.push({
      code: 'SCHOOL_WITHOUT_SENIOR_JURORS',
      message: `Faltan jurados senior (profesores) para colegios: ${schoolMissing} cupo(s) sin cubrir. Los colegios solo los califican seniors.`,
      level: 0,
    });
  }

  for (const team of teams) {
    const label = `${team.teamCode} (${team.teamName})`;
    if (!team.complete) {
      alerts.push({
        code: 'TEAM_INCOMPLETE',
        message: `El grupo ${label} queda con ${team.jurors.length} de ${target} jurados.`,
        teamId: team.id,
        level: team.level ?? undefined,
      });
    }
    if (team.level !== 0 && !team.hasSenior) {
      alerts.push({
        code: 'TEAM_WITHOUT_SENIOR',
        message: `El grupo ${label} no tiene jurado senior (profesor).`,
        teamId: team.id,
        level: team.level ?? undefined,
      });
    }
  }
  return alerts;
}

function levelCoverage(
  teams: PlannedTeam[],
  jurors: PlannedJuror[],
  target: number,
): LevelCoverage[] {
  const levels = [...new Set(teams.map((t) => t.level!))].sort((a, b) => a - b);
  return levels.map((level) => {
    const inLevel = teams.filter((t) => t.level === level);
    return {
      level,
      label: levelLabel(level),
      teams: inLevel.length,
      completeTeams: inLevel.filter((t) => t.complete).length,
      missingSlots: inLevel.reduce(
        (sum, t) => sum + Math.max(0, target - t.jurors.length),
        0,
      ),
      teamsWithoutSenior:
        level === 0 ? 0 : inLevel.filter((t) => !t.hasSenior).length,
      jurors: jurors.filter((j) => j.level === level).length,
    };
  });
}
