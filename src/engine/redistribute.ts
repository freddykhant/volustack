// src/engine/redistribute.ts
import type { MuscleGroup } from "~/schema";
import { MRV_PROXIMITY_SETS, PER_SET_MIN, SETUP_MIN, TREND_FLAT_BAND } from "./constants";
import type { DecisionFact } from "./facts";
import {
  choiceCloseCall,
  isUsableChoice,
  trendOf,
  verdictById,
  type JudgementRequest,
  type Verdict,
} from "./judgement";
import type { ReadinessSample } from "./readiness";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type {
  AdaptationContext,
  PrescriptionPlan,
  RedistributionCandidate,
  RedistributionKind,
  ResolvedMuscleTarget,
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

export const RESCHEDULE_PICK_ID = "reschedule_pick";

type VolumeStanding = "below MEV" | "between MEV and MAV" | "at or above MAV" | "at MRV ceiling";

/** Resolve the athlete's position against their own landmarks to a LABEL. jev-1.13
 * cannot reliably compare numbers, so every threshold comparison happens here. */
function volumeStanding(sets: number, t: ResolvedMuscleTarget): VolumeStanding {
  if (sets >= t.effectiveMrv - MRV_PROXIMITY_SETS) return "at MRV ceiling";
  if (sets >= t.mav) return "at or above MAV";
  if (sets >= t.mev) return "between MEV and MAV";
  return "below MEV";
}

/** Boundaries derived from `redistributeWeek`'s own `lateBlock` predicate (not an
 * independent thirds split), so the label the model sees never disagrees with the
 * deterministic floor: late starts exactly where `lateBlock` starts. */
function blockPhase(weekIndex: number, blockLengthWeeks: number): "early" | "mid" | "late" {
  const len = Math.max(1, blockLengthWeeks);
  if (weekIndex > Math.ceil(len / 2)) return "late";
  if (weekIndex <= Math.ceil(len / 4)) return "early";
  return "mid";
}

/**
 * The questions worth asking about a missed session, as data. The engine owns WHAT is
 * asked (it is domain knowledge); the server layer owns the asking.
 *
 * Only `reschedule_pick` influences anything this cycle; the other two are recorded for
 * calibration and cost almost nothing because they ride the same request.
 */
export function rescheduleQuestions(
  candidates: RedistributionCandidate[],
  week: WeekPlan,
  ctx: AdaptationContext,
  readiness: ReadinessSample[],
): JudgementRequest {
  const options: Record<string, string | null> = {};
  for (const c of candidates) {
    options[c.kind] =
      c.kind === "MAKE_UP"
        ? "Move every missed set into the remaining sessions this week."
        : c.kind === "PARTIAL"
          ? "Recover only the sets for muscles the athlete has prioritised; drop the rest."
          : "Recover nothing; accept the lost sets and keep the rest of the week as planned.";
  }

  const state = {
    blockPhase: blockPhase(week.index, ctx.blockLengthWeeks),
    week: { index: week.index, isDeload: week.isDeload },
    muscles: ctx.targets.map((t) => ({
      name: t.muscle,
      volumeStanding: volumeStanding(week.muscleVolume[t.muscle] ?? 0, t),
      prioritised: t.priority > 0,
    })),
    candidates: candidates.map((c) => ({
      option: c.kind,
      setsRecovered: c.tradeoff.recovered,
      setsDropped: c.tradeoff.dropped,
    })),
    readiness: { formTrend: trendOf(readiness.map((r) => r.form), TREND_FLAT_BAND) },
  };

  return {
    subject: "reschedule",
    state,
    questions: [
      {
        id: RESCHEDULE_PICK_ID,
        kind: "choice",
        authority: "ADVISORY",
        instructions:
          "A strength athlete missed a training session this week. Each option in `candidates` is a complete, already-costed plan for the rest of the week, with the sets it recovers and the sets it gives up. Using `muscles` for how much work each muscle has already taken, `blockPhase` for how far into the training block they are, and `readiness.formTrend` for whether they are freshening or fatiguing, which option serves this athlete best?",
        options,
      },
      {
        id: "overreaching",
        kind: "noul",
        authority: "ADVISORY",
        instructions:
          "Considering `muscles` and `readiness.formTrend` together, is this athlete accumulating more fatigue than they are recovering from?",
        criteria: {
          true: "Fatigue is outpacing recovery; adding work would dig the hole deeper.",
          false: "They are absorbing the current workload.",
        },
      },
      {
        id: "volume_loss_materiality",
        kind: "score",
        authority: "ADVISORY",
        instructions:
          "If the missed sets in `candidates` are not recovered at all, how much does that cost this athlete's training for the week?",
        levels: [
          "Nothing meaningful — every muscle still gets enough work to make progress.",
          "Slight — a little progress is left on the table, but nothing is undertrained.",
          "Meaningful — a muscle the athlete has prioritised loses real stimulus.",
          "Serious — one or more muscles drop below the minimum that maintains progress.",
        ],
      },
    ],
  };
}

/**
 * ADVISORY applier. May move `recommended` and append facts — nothing else. Every set
 * count and every muscle volume is passed through untouched, which the Law 1 property
 * in `reschedule-judgement.test.ts` asserts for arbitrary verdicts. The `recommended`
 * flags are either left unchanged (early return) or exactly one is true afterward
 * (mutating path) — never zero, never more than one.
 */
export function applyRescheduleVerdicts(
  candidates: RedistributionCandidate[],
  verdicts: Verdict[],
): RedistributionCandidate[] {
  if (verdicts.length === 0) return candidates;
  const offered = candidates.map((c) => c.kind);
  const v = verdictById(verdicts, RESCHEDULE_PICK_ID);
  if (!isUsableChoice(v, offered)) return candidates;

  // "none" rather than offered[0]! — a fact must never claim a deterministic pick the
  // engine never actually made.
  const deterministic = candidates.find((c) => c.recommended)?.kind ?? "none";
  const facts: DecisionFact[] = [
    {
      kind: "judged",
      subject: "reschedule",
      questionId: RESCHEDULE_PICK_ID,
      selected: v.choice,
      deterministic,
      basis: { kind: "confidence", value: v.confidence },
    },
  ];
  const close = choiceCloseCall(v);
  if (close) {
    facts.push({
      kind: "close_call",
      subject: "reschedule",
      questionId: RESCHEDULE_PICK_ID,
      between: close.between,
      margin: close.margin,
    });
  }

  return candidates.map((c) =>
    c.kind === v.choice
      ? { ...c, recommended: true, facts: [...c.facts, ...facts] }
      : { ...c, recommended: false },
  );
}
