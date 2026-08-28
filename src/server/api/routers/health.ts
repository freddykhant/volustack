import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

/**
 * Minimal liveness router.
 *
 * Also load-bearing for types: tRPC's `createHydrationHelpers` rejects a router
 * whose record is `{}`, because an empty record is structurally as wide as
 * `AnyRouter` and trips its "generic parameter missing" guard. Keeping at least
 * one procedure registered keeps `~/trpc/server` compiling.
 */
export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(() => "ok" as const),
});
