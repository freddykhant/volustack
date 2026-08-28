import { describe, expect, it } from "vitest";
import * as Prisma from "../../generated/prisma";
import * as Domain from "./enums";

/**
 * Each row pairs a Prisma enum object with the Zod enum that is its source of
 * truth. Adding a domain enum means adding a row here.
 */
const PAIRS: ReadonlyArray<
  readonly [
    name: string,
    prisma: Record<string, string>,
    zod: readonly string[],
  ]
> = [
  ["MuscleGroup", Prisma.MuscleGroup, Domain.MuscleGroupEnum.options],
  ["TrainingPhase", Prisma.TrainingPhase, Domain.TrainingPhaseEnum.options],
  ["Sex", Prisma.Sex, Domain.SexEnum.options],
  ["ActivityLevel", Prisma.ActivityLevel, Domain.ActivityLevelEnum.options],
  [
    "ExperienceLevel",
    Prisma.ExperienceLevel,
    Domain.ExperienceLevelEnum.options,
  ],
  ["SplitType", Prisma.SplitType, Domain.SplitTypeEnum.options],
  [
    "MovementPattern",
    Prisma.MovementPattern,
    Domain.MovementPatternEnum.options,
  ],
  ["Equipment", Prisma.Equipment, Domain.EquipmentEnum.options],
  ["MuscleRole", Prisma.MuscleRole, Domain.MuscleRoleEnum.options],
  [
    "ContraindicationTag",
    Prisma.ContraindicationTag,
    Domain.ContraindicationTagEnum.options,
  ],
  ["CheckInScope", Prisma.CheckInScope, Domain.CheckInScopeEnum.options],
  ["CheckInCadence", Prisma.CheckInCadence, Domain.CheckInCadenceEnum.options],
  ["BlockStatus", Prisma.BlockStatus, Domain.BlockStatusEnum.options],
  ["DecisionType", Prisma.DecisionType, Domain.DecisionTypeEnum.options],
  ["DecisionStatus", Prisma.DecisionStatus, Domain.DecisionStatusEnum.options],
];

describe("Zod ↔ Prisma enum parity", () => {
  it.each(PAIRS)(
    "%s has identical members on both sides",
    (_name, prisma, zod) => {
      expect(Object.values(prisma).sort()).toEqual([...zod].sort());
    },
  );

  it("covers every domain enum exported from ~/schema/enums", () => {
    const exported = Object.keys(Domain).filter((k) => k.endsWith("Enum"));
    expect(exported).toHaveLength(PAIRS.length);
  });
});
