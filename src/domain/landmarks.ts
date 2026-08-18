import { type MuscleGroup } from "~/schema";

export interface Landmarks {
  /** Minimum Effective Volume — weekly sets below which no growth stimulus. */
  mev: number;
  /** Maximum Adaptive Volume — the productive middle of the range. */
  mav: number;
  /** Maximum Recoverable Volume — weekly sets beyond which recovery fails. */
  mrv: number;
}

export const DEFAULT_LANDMARKS: Record<MuscleGroup, Landmarks> = {
  CHEST: { mev: 8, mav: 14, mrv: 22 },
  BACK: { mev: 10, mav: 16, mrv: 25 },
  TRAPS: { mev: 4, mav: 12, mrv: 26 },
  FRONT_DELTS: { mev: 0, mav: 8, mrv: 12 },
  SIDE_DELTS: { mev: 8, mav: 16, mrv: 26 },
  REAR_DELTS: { mev: 6, mav: 12, mrv: 24 },
  BICEPS: { mev: 6, mav: 14, mrv: 26 },
  TRICEPS: { mev: 6, mav: 12, mrv: 24 },
  FOREARMS: { mev: 2, mav: 8, mrv: 20 },
  ABS: { mev: 0, mav: 12, mrv: 25 },
  QUADS: { mev: 8, mav: 14, mrv: 20 },
  HAMSTRINGS: { mev: 4, mav: 10, mrv: 20 },
  GLUTES: { mev: 0, mav: 8, mrv: 16 },
  CALVES: { mev: 6, mav: 12, mrv: 22 },
};
