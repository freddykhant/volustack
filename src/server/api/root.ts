import { checkinRouter } from "~/server/api/routers/checkin";
import { healthRouter } from "~/server/api/routers/health";
import { mesocycleRouter } from "~/server/api/routers/mesocycle";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { readinessRouter } from "~/server/api/routers/readiness";
import { scheduleRouter } from "~/server/api/routers/schedule";
import { sessionRouter } from "~/server/api/routers/session";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  mesocycle: mesocycleRouter,
  onboarding: onboardingRouter,
  session: sessionRouter,
  schedule: scheduleRouter,
  checkin: checkinRouter,
  readiness: readinessRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 */
export const createCaller = createCallerFactory(appRouter);
