// src/engine/redistribute.ts
import type { MuscleGroup } from "~/schema";
import { PER_SET_MIN, SETUP_MIN } from "./constants";
import type { DecisionFact } from "./facts";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type {
  AdaptationContext,
  PrescriptionPlan,
  RedistributionCandidate,
  RedistributionKind,
  SessionPlan,
  WeekPlan,
} from "./types";
import { computeVolume, roundVolumeMap } from "./util";

interface MissedPx extends PrescriptionPlan {
  fromSlot: string;
}

export function redistributeWeek(
  week: WeekPlan,
  missedSessionIds: string[],
  ctx: AdaptationContext,
): RedistributionCandidate[] {
  const missed = new Set(missedSessionIds);
  const missedSessions = week.sessions.filter((s) => missed.has(s.slotId));
  const remainingSessions = week.sessions.filter((s) => !missed.has(s.slotId));
  if (missedSessions.length === 0) return [];

  const slots = buildSessionSlots(ctx.splitType, ctx.daysPerWeek);
  const eligibleBySlot = new Map(
    slots.map((s) => [s.id, new Set<MuscleGroup>(s.eligibleMuscles)]),
  );
  const byName = new Map(ctx.library.map((e) => [e.name, e]));
  const targetByMuscle = new Map(ctx.targets.map((t) => [t.muscle, t]));
  const primaryMuscle = (name: string): MuscleGroup | undefined =>
    byName.get(name)?.muscles.find((m) => m.role === "PRIMARY")?.muscle;

  const missedPx: MissedPx[] = missedSessions.flatMap((s) =>
    s.prescriptions.map((p) => ({ ...p, fromSlot: s.slotId })),
  );

  function build(
    kind: RedistributionKind,
    shouldRecover: (px: MissedPx) => boolean,
  ): RedistributionCandidate {
    const sessions: SessionPlan[] = remainingSessions.map((s) => ({
      slotId: s.slotId,
      label: s.label,
      prescriptions: s.prescriptions.map((p) => ({ ...p })),
      estimatedMinutes: s.estimatedMinutes,
    }));
    const facts: DecisionFact[] = [];
    let recovered = 0;
    let dropped = 0;

    for (const px of missedPx) {
      const pm = primaryMuscle(px.exerciseName);
      if (pm === undefined || !shouldRecover(px)) {
        dropped += px.sets;
        if (pm !== undefined) {
          facts.push({ kind: "dropped_volume", muscle: pm, sets: px.sets, belowMev: false, cause: "missed_session" });
        }
        continue;
      }
      let remainingSets = px.sets;
      while (remainingSets > 0) {
        const dest = sessions
          .filter((s) => eligibleBySlot.get(s.slotId)?.has(pm))
          .filter((s) => sessionMinutes(s.prescriptions) + SETUP_MIN + PER_SET_MIN <= ctx.sessionLengthCapMin)
          .sort((a, b) => sessionMinutes(a.prescriptions) - sessionMinutes(b.prescriptions) || a.slotId.localeCompare(b.slotId))[0];
        if (!dest) break;
        const existing = dest.prescriptions.find((p) => p.exerciseName === px.exerciseName);
        if (existing) existing.sets += 1;
        else dest.prescriptions.push({ ...px, sets: 1 });
        dest.estimatedMinutes = sessionMinutes(dest.prescriptions);
        recovered += 1;
        remainingSets -= 1;
        facts.push({ kind: "redistributed", muscle: pm, sets: 1, from: px.fromSlot, to: dest.slotId });
      }
      if (remainingSets > 0) {
        dropped += remainingSets;
        facts.push({ kind: "dropped_volume", muscle: pm, sets: remainingSets, belowMev: false, cause: "missed_session" });
      }
    }

    const allPx = sessions.flatMap((s) => s.prescriptions).map((p) => ({ exerciseName: p.exerciseName, sets: p.sets }));
    const muscleVolume = roundVolumeMap(computeVolume(allPx, ctx.library));

    for (const t of ctx.targets) {
      if (muscleVolume[t.muscle] < t.mev) {
        facts.push({ kind: "dropped_volume", muscle: t.muscle, sets: 0, belowMev: true, cause: "missed_session" });
      }
    }

    return {
      kind,
      week: { index: week.index, isDeload: week.isDeload, sessions, muscleVolume },
      tradeoff: { recovered, dropped },
      recommended: false,
      facts,
    };
  }

  const makeUp = build("MAKE_UP", () => true);
  const partial = build("PARTIAL", (px) => {
    const pm = primaryMuscle(px.exerciseName);
    return pm !== undefined && (targetByMuscle.get(pm)?.priority ?? 0) > 0;
  });
  const letGo = build("LET_GO", () => false);

  // Emit 1–3 distinct candidates.
  const out: RedistributionCandidate[] = [];
  if (makeUp.tradeoff.recovered > 0) out.push(makeUp);
  if (
    partial.tradeoff.recovered > 0 &&
    partial.tradeoff.recovered < makeUp.tradeoff.recovered
  ) {
    out.push(partial);
  }
  out.push(letGo);

  // Recommendation policy: late block + near MRV → LET_GO, else MAKE_UP.
  const nearMrv = ctx.targets.some(
    (t) => (week.muscleVolume[t.muscle] ?? 0) >= t.effectiveMrv - 2,
  );
  const lateBlock = week.index > Math.ceil(ctx.blockLengthWeeks / 2);
  const preferred: RedistributionKind = lateBlock && nearMrv ? "LET_GO" : "MAKE_UP";
  const pick = out.find((c) => c.kind === preferred) ?? out[0]!;
  pick.recommended = true;

  return out;
}
