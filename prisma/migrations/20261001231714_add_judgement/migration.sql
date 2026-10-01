-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'TRAPS', 'FRONT_DELTS', 'SIDE_DELTS', 'REAR_DELTS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'ABS', 'QUADS', 'HAMSTRINGS', 'GLUTES', 'CALVES');

-- CreateEnum
CREATE TYPE "TrainingPhase" AS ENUM ('CUT', 'MAINTAIN', 'BULK');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('FULL_BODY', 'UPPER_LOWER', 'PUSH_PULL_LEGS', 'BRO_SPLIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MovementPattern" AS ENUM ('HORIZONTAL_PUSH', 'VERTICAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'SQUAT', 'HINGE', 'LUNGE', 'ISOLATION');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'SMITH', 'KETTLEBELL');

-- CreateEnum
CREATE TYPE "MuscleRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "ContraindicationTag" AS ENUM ('KNEE', 'SHOULDER', 'LOWER_BACK', 'ELBOW', 'HIP', 'WRIST');

-- CreateEnum
CREATE TYPE "CheckInScope" AS ENUM ('WEEK', 'SESSION', 'AD_HOC');

-- CreateEnum
CREATE TYPE "CheckInCadence" AS ENUM ('WEEKLY', 'PER_SESSION', 'PER_BLOCK', 'AD_HOC');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MISSED');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('GENERATE', 'PROGRESS', 'DELOAD', 'REDISTRIBUTE', 'MANUAL_ADJUST');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "sex" "Sex",
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "activityLevel" "ActivityLevel",
    "tdee" DOUBLE PRECISION,
    "phase" "TrainingPhase" NOT NULL DEFAULT 'MAINTAIN',
    "experience" "ExperienceLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muscle_landmark" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "muscle" "MuscleGroup" NOT NULL,
    "mev" INTEGER NOT NULL,
    "mav" INTEGER NOT NULL,
    "mrv" INTEGER NOT NULL,

    CONSTRAINT "muscle_landmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "movementPattern" "MovementPattern" NOT NULL,
    "equipment" "Equipment" NOT NULL,
    "contraindications" "ContraindicationTag"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_muscle" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "muscle" "MuscleGroup" NOT NULL,
    "role" "MuscleRole" NOT NULL,
    "fraction" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "exercise_muscle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constraint_set" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "daysPerWeek" INTEGER NOT NULL,
    "splitType" "SplitType" NOT NULL,
    "sessionLengthCapMin" INTEGER NOT NULL,
    "blockLengthWeeks" INTEGER NOT NULL,
    "deloadWeekIndex" INTEGER,
    "checkInCadence" "CheckInCadence" NOT NULL DEFAULT 'WEEKLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "constraint_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muscle_target" (
    "id" TEXT NOT NULL,
    "constraintSetId" TEXT NOT NULL,
    "muscle" "MuscleGroup" NOT NULL,
    "weeklySetTarget" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "muscle_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_exclusion" (
    "id" TEXT NOT NULL,
    "constraintSetId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "exercise_exclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesocycle" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "constraintSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BlockStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "lengthWeeks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mesocycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "week" (
    "id" TEXT NOT NULL,
    "mesocycleId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "isDeload" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "week_muscle_volume" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "muscle" "MuscleGroup" NOT NULL,
    "plannedSets" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "week_muscle_volume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_session" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "splitSlot" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "targetDurationMin" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "training_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_prescription" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "targetRepLow" INTEGER,
    "targetRepHigh" INTEGER,
    "targetRir" INTEGER,

    CONSTRAINT "exercise_prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_log" (
    "id" TEXT NOT NULL,
    "exercisePrescriptionId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "achievedRir" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "set_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "weekId" TEXT,
    "scope" "CheckInScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_muscle" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "muscle" "MuscleGroup" NOT NULL,
    "recovery" INTEGER,
    "performance" INTEGER,
    "jointStress" INTEGER,
    "plannedSets" DOUBLE PRECISION,
    "actualSets" DOUBLE PRECISION,

    CONSTRAINT "check_in_muscle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_log" (
    "id" TEXT NOT NULL,
    "mesocycleId" TEXT NOT NULL,
    "weekIndex" INTEGER,
    "type" "DecisionType" NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "summary" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "decision_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judgement" (
    "id" TEXT NOT NULL,
    "mesocycleId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "questionsHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "verdicts" JSONB NOT NULL,
    "fallback" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_profile_userId_key" ON "athlete_profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "muscle_landmark_athleteProfileId_muscle_key" ON "muscle_landmark"("athleteProfileId", "muscle");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_name_key" ON "exercise"("name");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_muscle_exerciseId_muscle_key" ON "exercise_muscle"("exerciseId", "muscle");

-- CreateIndex
CREATE UNIQUE INDEX "constraint_set_athleteProfileId_version_key" ON "constraint_set"("athleteProfileId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "muscle_target_constraintSetId_muscle_key" ON "muscle_target"("constraintSetId", "muscle");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_exclusion_constraintSetId_exerciseId_key" ON "exercise_exclusion"("constraintSetId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "week_mesocycleId_index_key" ON "week"("mesocycleId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "week_muscle_volume_weekId_muscle_key" ON "week_muscle_volume"("weekId", "muscle");

-- CreateIndex
CREATE UNIQUE INDEX "training_session_weekId_order_key" ON "training_session"("weekId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "set_log_exercisePrescriptionId_setNumber_key" ON "set_log"("exercisePrescriptionId", "setNumber");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_muscle_checkInId_muscle_key" ON "check_in_muscle"("checkInId", "muscle");

-- CreateIndex
CREATE INDEX "decision_log_mesocycleId_createdAt_idx" ON "decision_log"("mesocycleId", "createdAt");

-- CreateIndex
CREATE INDEX "judgement_mesocycleId_createdAt_idx" ON "judgement"("mesocycleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "judgement_mesocycleId_subject_stateHash_questionsHash_key" ON "judgement"("mesocycleId", "subject", "stateHash", "questionsHash");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profile" ADD CONSTRAINT "athlete_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muscle_landmark" ADD CONSTRAINT "muscle_landmark_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "athlete_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_muscle" ADD CONSTRAINT "exercise_muscle_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraint_set" ADD CONSTRAINT "constraint_set_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "athlete_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muscle_target" ADD CONSTRAINT "muscle_target_constraintSetId_fkey" FOREIGN KEY ("constraintSetId") REFERENCES "constraint_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_exclusion" ADD CONSTRAINT "exercise_exclusion_constraintSetId_fkey" FOREIGN KEY ("constraintSetId") REFERENCES "constraint_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_exclusion" ADD CONSTRAINT "exercise_exclusion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesocycle" ADD CONSTRAINT "mesocycle_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "athlete_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesocycle" ADD CONSTRAINT "mesocycle_constraintSetId_fkey" FOREIGN KEY ("constraintSetId") REFERENCES "constraint_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week" ADD CONSTRAINT "week_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_muscle_volume" ADD CONSTRAINT "week_muscle_volume_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_prescription" ADD CONSTRAINT "exercise_prescription_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "training_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_prescription" ADD CONSTRAINT "exercise_prescription_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_exercisePrescriptionId_fkey" FOREIGN KEY ("exercisePrescriptionId") REFERENCES "exercise_prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "athlete_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "week"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_muscle" ADD CONSTRAINT "check_in_muscle_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "check_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgement" ADD CONSTRAINT "judgement_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
