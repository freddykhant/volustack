import {
  type ContraindicationTag,
  type Equipment,
  type MovementPattern,
  type MuscleGroup,
  type MuscleRole,
} from "~/schema";

export interface ExerciseMuscleDef {
  muscle: MuscleGroup;
  role: MuscleRole;
  fraction: number;
}

export interface ExerciseDef {
  name: string;
  movementPattern: MovementPattern;
  equipment: Equipment;
  contraindications: ContraindicationTag[];
  muscles: ExerciseMuscleDef[];
}

/** Primary mover: full set credit. */
const P = (muscle: MuscleGroup): ExerciseMuscleDef => ({
  muscle,
  role: "PRIMARY",
  fraction: 1.0,
});

/** Secondary mover: fractional set credit. */
const S = (muscle: MuscleGroup, fraction: number): ExerciseMuscleDef => ({
  muscle,
  role: "SECONDARY",
  fraction,
});

export const EXERCISE_LIBRARY: ExerciseDef[] = [
  {
    name: "Barbell Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "BARBELL",
    contraindications: ["SHOULDER"],
    muscles: [P("CHEST"), S("TRICEPS", 0.5), S("FRONT_DELTS", 0.5)],
  },
  {
    name: "Incline Dumbbell Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "DUMBBELL",
    contraindications: ["SHOULDER"],
    muscles: [P("CHEST"), S("FRONT_DELTS", 0.5), S("TRICEPS", 0.5)],
  },
  {
    name: "Overhead Press",
    movementPattern: "VERTICAL_PUSH",
    equipment: "BARBELL",
    contraindications: ["SHOULDER"],
    muscles: [P("FRONT_DELTS"), S("SIDE_DELTS", 0.5), S("TRICEPS", 0.5)],
  },
  {
    name: "Lateral Raise",
    movementPattern: "ISOLATION",
    equipment: "DUMBBELL",
    contraindications: [],
    muscles: [P("SIDE_DELTS")],
  },
  {
    name: "Barbell Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "BARBELL",
    contraindications: ["LOWER_BACK"],
    muscles: [P("BACK"), S("BICEPS", 0.5), S("REAR_DELTS", 0.5)],
  },
  {
    name: "Lat Pulldown",
    movementPattern: "VERTICAL_PULL",
    equipment: "CABLE",
    contraindications: [],
    muscles: [P("BACK"), S("BICEPS", 0.5)],
  },
  {
    name: "Face Pull",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "CABLE",
    contraindications: [],
    muscles: [P("REAR_DELTS"), S("TRAPS", 0.5)],
  },
  {
    name: "Barbell Back Squat",
    movementPattern: "SQUAT",
    equipment: "BARBELL",
    contraindications: ["KNEE", "LOWER_BACK"],
    muscles: [P("QUADS"), S("GLUTES", 0.5), S("HAMSTRINGS", 0.25)],
  },
  {
    name: "Leg Press",
    movementPattern: "SQUAT",
    equipment: "MACHINE",
    contraindications: ["KNEE"],
    muscles: [P("QUADS"), S("GLUTES", 0.5)],
  },
  {
    name: "Romanian Deadlift",
    movementPattern: "HINGE",
    equipment: "BARBELL",
    contraindications: ["LOWER_BACK"],
    muscles: [P("HAMSTRINGS"), S("GLUTES", 0.5), S("BACK", 0.25)],
  },
  {
    name: "Barbell Curl",
    movementPattern: "ISOLATION",
    equipment: "BARBELL",
    contraindications: ["ELBOW"],
    muscles: [P("BICEPS"), S("FOREARMS", 0.25)],
  },
  {
    name: "Cable Triceps Pushdown",
    movementPattern: "ISOLATION",
    equipment: "CABLE",
    contraindications: ["ELBOW"],
    muscles: [P("TRICEPS")],
  },
];
