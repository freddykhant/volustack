-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('RUN', 'RIDE', 'SWIM', 'SPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityIntensity" AS ENUM ('EASY', 'MODERATE', 'HARD');

-- CreateTable
CREATE TABLE "outside_activity" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "daypart" "Daypart",
    "kind" "ActivityKind" NOT NULL,
    "intensity" "ActivityIntensity" NOT NULL,
    "durationMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outside_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outside_activity_athleteProfileId_date_idx" ON "outside_activity"("athleteProfileId", "date");

-- AddForeignKey
ALTER TABLE "outside_activity" ADD CONSTRAINT "outside_activity_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "athlete_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

