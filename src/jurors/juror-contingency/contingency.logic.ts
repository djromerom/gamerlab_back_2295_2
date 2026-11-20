import { JurorCategory } from '@prisma/client';

/**
 * HU-14 (ARK-213): grupos en riesgo y sugerencia de suplentes. Lógica pura, sin base de datos.
 *
 * Quién cuenta en un grupo (protocolo del 23-oct):
 * - Un jurado que ya evaluó el grupo siempre cuenta: su evaluación nunca se pierde.
 * - Antes de la hora de control (11:00) cuentan todos los asignados (aún pueden llegar).
 * - Desde la hora de control cuentan los presentes (con llegada registrada). Un jurado que llega
 *   tarde vuelve a contar: conserva todos sus grupos.
 * - HU-44 (ARK-293): el que «No podrá asistir» (respuesta de HU-13 vigente, sin check-in después)
 *   deja de contar de inmediato, sin esperar la hora de control: sus grupos quedan en riesgo y se
 *   cubren con suplentes, sin quitarle las asignaciones. Si al final llega, vuelve a contar.
 * - Un presente que se retiró deja de contar en los grupos que aún no evaluó: esos grupos quedan
 *   en riesgo y se cubren sumando un suplente, sin quitarle nada. «Se retiró» = las dos señales de
 *   HU-23 a la vez: «posible salida» (sin actividad) y «presencia sin confirmar» (no respondió
 *   «Sigo aquí»). Solo la primera no basta: un jurado que califica despacio la tiene a los 45 min.
 *
 * Faltantes = mínimo − contados (mínimo 0). El mínimo es configurable (3 por defecto).
 *
 * Orden de los suplentes para un grupo (criterio de aceptación de HU-14):
 * 1. mismo nivel: sus grupos actuales son del nivel del grupo, o todavía no tiene grupos;
 * 2. senior si el grupo es de colegio (N0). Un junior no puede calificar colegios (bloqueo de
 *    HU-08), así que en N0 este criterio es un filtro: solo se proponen seniors;
 * 3. misma categoría que el jurado ausente;
 * 4. menor carga actual (grupos asignados, contando los que ya se le sugirieron);
 * 5. presencia confirmada (llegada registrada);
 * 6. a igualdad, por nombre.
 *
 * Sirve para varios jurados ausentes a la vez o para uno solo (HU-24 reutiliza el cálculo).
 */

export type ContingencyBasis = 'ASSIGNED' | 'PRESENT';

/** Situación de un jurado asignado dentro de un grupo. */
export type GroupJurorStatus = 'PRESENT' | 'ABSENT' | 'LEFT';

export interface GroupJurorInput {
  id: string;
  name: string;
  category: JurorCategory | null;
  /** Llegada registrada (HU-11). */
  checkedIn: boolean;
  /** Se retiró: «posible salida» y «presencia sin confirmar» de HU-23 a la vez. */
  possibleLeft: boolean;
  /** HU-44: «No podrá asistir» vigente (ausente confirmado). */
  notComing: boolean;
  /** Ya envió su evaluación de este grupo. */
  evaluated: boolean;
}

export interface ContingencyTeamInput {
  id: number;
  teamCode: string;
  teamName: string;
  videogame: string | null;
  /** 0 = colegios; null si el código no tiene nivel. */
  level: number | null;
  jurors: GroupJurorInput[];
}

export interface SubstituteInput {
  id: string;
  name: string;
  category: JurorCategory | null;
  checkedIn: boolean;
  /** Grupos que ya tiene en la edición, con su nivel. */
  teams: { id: number; level: number | null }[];
}

export interface GroupJurorView {
  id: string;
  nombre: string;
  categoria: JurorCategory | null;
  estado: GroupJurorStatus;
  /** HU-44: ausente confirmado («No podrá asistir»). */
  noVendra: boolean;
  evaluo: boolean;
  cuenta: boolean;
}

export interface GroupAtRisk {
  teamId: number;
  codigo: string;
  nombre: string;
  videojuego: string | null;
  nivel: number | null;
  juradosContados: number;
  faltantes: number;
  jurados: GroupJurorView[];
}

export interface RankedSubstitute {
  id: string;
  nombre: string;
  categoria: JurorCategory | null;
  /** Grupos que tendría al aceptar (incluye los ya sugeridos en esta misma propuesta). */
  carga: number;
  llegada: boolean;
  mismoNivel: boolean;
  mismaCategoria: boolean;
  /** El administrador ya rechazó a este suplente para este grupo. */
  rechazado: boolean;
}

export interface GroupSuggestion extends GroupAtRisk {
  sugeridos: RankedSubstitute[];
  /** Los demás suplentes posibles, en el mismo orden, para asignar a mano. */
  alternativas: RankedSubstitute[];
  /** Faltantes que no se pudieron cubrir con ningún suplente. */
  sinCubrir: number;
}

const statusOf = (juror: GroupJurorInput): GroupJurorStatus => {
  if (!juror.checkedIn) return 'ABSENT';
  return juror.possibleLeft ? 'LEFT' : 'PRESENT';
};

/** Si el jurado cuenta hoy para el grupo. */
export function countsForGroup(
  juror: GroupJurorInput,
  basis: ContingencyBasis,
): boolean {
  if (juror.evaluated) return true;
  if (juror.notComing && !juror.checkedIn) return false;
  if (basis === 'ASSIGNED') return true;
  return statusOf(juror) === 'PRESENT';
}

/** Grupos con menos jurados que cuentan que el mínimo, de más a menos faltantes. */
export function groupsAtRisk(
  teams: ContingencyTeamInput[],
  options: { basis: ContingencyBasis; minimum: number },
): GroupAtRisk[] {
  return teams
    .map((team): GroupAtRisk => {
      const jurados = team.jurors.map((juror) => ({
        id: juror.id,
        nombre: juror.name,
        categoria: juror.category,
        estado: statusOf(juror),
        noVendra: juror.notComing && !juror.checkedIn,
        evaluo: juror.evaluated,
        cuenta: countsForGroup(juror, options.basis),
      }));
      const counted = jurados.filter((juror) => juror.cuenta).length;
      return {
        teamId: team.id,
        codigo: team.teamCode,
        nombre: team.teamName,
        videojuego: team.videogame,
        nivel: team.level,
        juradosContados: counted,
        faltantes: Math.max(0, options.minimum - counted),
        jurados,
      };
    })
    .filter((group) => group.faltantes > 0)
    .sort(
      (a, b) =>
        b.faltantes - a.faltantes ||
        a.codigo.localeCompare(b.codigo, 'es', { sensitivity: 'base' }) ||
        a.teamId - b.teamId,
    );
}

interface CandidateState {
  input: SubstituteInput;
  load: number;
  levels: Set<number | null>;
  teamIds: Set<number>;
}

/** Un junior (o sin categoría) no puede calificar colegios (HU-08: bloqueo). */
const canEvaluate = (candidate: SubstituteInput, level: number | null) =>
  level !== 0 || candidate.category === JurorCategory.SENIOR;

function rankFor(
  group: GroupAtRisk,
  absentCategories: Set<JurorCategory | null>,
  candidates: CandidateState[],
  rejected: Set<string>,
): RankedSubstitute[] {
  const view = (c: CandidateState): RankedSubstitute => ({
    id: c.input.id,
    nombre: c.input.name,
    categoria: c.input.category,
    carga: c.load,
    llegada: c.input.checkedIn,
    mismoNivel: [...c.levels].every((level) => level === group.nivel),
    mismaCategoria:
      c.input.category !== null && absentCategories.has(c.input.category),
    rechazado: rejected.has(`${group.teamId}:${c.input.id}`),
  });
  const flag = (value: boolean) => (value ? 0 : 1);
  return candidates
    .filter(
      (c) =>
        !c.teamIds.has(group.teamId) &&
        !group.jurados.some((juror) => juror.id === c.input.id) &&
        canEvaluate(c.input, group.nivel),
    )
    .map(view)
    .sort(
      (a, b) =>
        flag(a.mismoNivel) - flag(b.mismoNivel) ||
        flag(a.mismaCategoria) - flag(b.mismaCategoria) ||
        a.carga - b.carga ||
        flag(a.llegada) - flag(b.llegada) ||
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Propuesta para todos los grupos en riesgo. Se llena primero el grupo con más faltantes y cada
 * suplente elegido suma carga, así la propuesta reparte el trabajo. Un suplente rechazado para un
 * grupo no se vuelve a sugerir ahí, pero sigue en `alternativas` (marcado) para asignarlo a mano.
 */
export function suggestSubstitutes(
  groups: GroupAtRisk[],
  substitutes: SubstituteInput[],
  options: {
    rejectedPairs?: Array<{ teamId: number; substituteId: string }>;
  } = {},
): GroupSuggestion[] {
  const rejected = new Set(
    (options.rejectedPairs ?? []).map((r) => `${r.teamId}:${r.substituteId}`),
  );
  const candidates: CandidateState[] = substitutes.map((input) => ({
    input,
    load: input.teams.length,
    levels: new Set(input.teams.map((team) => team.level)),
    teamIds: new Set(input.teams.map((team) => team.id)),
  }));
  const byId = new Map(candidates.map((c) => [c.input.id, c]));

  return groups.map((group): GroupSuggestion => {
    const absentCategories = new Set(
      group.jurados.filter((juror) => !juror.cuenta).map((j) => j.categoria),
    );
    const sugeridos: RankedSubstitute[] = [];
    for (let slot = 0; slot < group.faltantes; slot++) {
      const ranked = rankFor(group, absentCategories, candidates, rejected);
      const next = ranked.find(
        (c) => !c.rechazado && !sugeridos.some((s) => s.id === c.id),
      );
      if (!next) break;
      const state = byId.get(next.id)!;
      state.load += 1;
      state.levels.add(group.nivel);
      state.teamIds.add(group.teamId);
      sugeridos.push({ ...next, carga: state.load });
    }
    const chosen = new Set(sugeridos.map((s) => s.id));
    return {
      ...group,
      sugeridos,
      alternativas: rankFor(
        group,
        absentCategories,
        candidates,
        rejected,
      ).filter((c) => !chosen.has(c.id)),
      sinCubrir: group.faltantes - sugeridos.length,
    };
  });
}
