import { z } from "zod";

export const MuscleGroupEnum = z.enum([
  "CHEST",
  "BACK",
  "TRAPS",
  "FRONT_DELTS",
  "SIDE_DELTS",
  "REAR_DELTS",
  "BICEPS",
  "TRICEPS",
  "FOREARMS",
  "ABS",
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "CALVES",
]);
export type MuscleGroup = z.infer<typeof MuscleGroupEnum>;
export const MUSCLE_GROUPS: readonly MuscleGroup[] = MuscleGroupEnum.options;

export const TrainingPhaseEnum = z.enum(["CUT", "MAINTAIN", "BULK"]);
export type TrainingPhase = z.infer<typeof TrainingPhaseEnum>;

export const SexEnum = z.enum(["MALE", "FEMALE"]);
export type Sex = z.infer<typeof SexEnum>;

export const ActivityLevelEnum = z.enum([
  "SEDENTARY",
  "LIGHT",
  "MODERATE",
  "ACTIVE",
  "VERY_ACTIVE",
]);
export type ActivityLevel = z.infer<typeof ActivityLevelEnum>;

export const ExperienceLevelEnum = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
]);
export type ExperienceLevel = z.infer<typeof ExperienceLevelEnum>;

export const SplitTypeEnum = z.enum([
  "FULL_BODY",
  "UPPER_LOWER",
  "PUSH_PULL_LEGS",
  "BRO_SPLIT",
  "CUSTOM",
]);
export type SplitType = z.infer<typeof SplitTypeEnum>;

export const MovementPatternEnum = z.enum([
  "HORIZONTAL_PUSH",
  "VERTICAL_PUSH",
  "HORIZONTAL_PULL",
  "VERTICAL_PULL",
  "SQUAT",
  "HINGE",
  "LUNGE",
  "ISOLATION",
]);
export type MovementPattern = z.infer<typeof MovementPatternEnum>;

export const EquipmentEnum = z.enum([
  "BARBELL",
  "DUMBBELL",
  "MACHINE",
  "CABLE",
  "BODYWEIGHT",
  "SMITH",
  "KETTLEBELL",
]);
export type Equipment = z.infer<typeof EquipmentEnum>;

export const MuscleRoleEnum = z.enum(["PRIMARY", "SECONDARY"]);
export type MuscleRole = z.infer<typeof MuscleRoleEnum>;

export const ContraindicationTagEnum = z.enum([
  "KNEE",
  "SHOULDER",
  "LOWER_BACK",
  "ELBOW",
  "HIP",
  "WRIST",
]);
export type ContraindicationTag = z.infer<typeof ContraindicationTagEnum>;

export const CheckInScopeEnum = z.enum(["WEEK", "SESSION", "AD_HOC"]);
export type CheckInScope = z.infer<typeof CheckInScopeEnum>;

export const CheckInCadenceEnum = z.enum([
  "WEEKLY",
  "PER_SESSION",
  "PER_BLOCK",
  "AD_HOC",
]);
export type CheckInCadence = z.infer<typeof CheckInCadenceEnum>;

export const BlockStatusEnum = z.enum([
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
]);
export type BlockStatus = z.infer<typeof BlockStatusEnum>;

export const DecisionTypeEnum = z.enum([
  "GENERATE",
  "PROGRESS",
  "DELOAD",
  "REDISTRIBUTE",
  "MANUAL_ADJUST",
]);
export type DecisionType = z.infer<typeof DecisionTypeEnum>;

export const DecisionStatusEnum = z.enum([
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
  "APPLIED",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusEnum>;
