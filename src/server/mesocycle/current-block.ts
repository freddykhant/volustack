import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";
import type { MesocycleView } from "~/views/types";

/**
 * The signed-in athlete's current block, fetched at most once per request.
 * `cache()` is request-scoped, so the /app layout and any page it renders share
 * a single getCurrentBlock query instead of each re-issuing it.
 */
export const currentBlock = cache(
  async (): Promise<MesocycleView | null> => api.mesocycle.getCurrentBlock(),
);

/**
 * The current block, guaranteed non-null. A blockless athlete is redirected to
 * onboarding (the same gate the /app layout applies) — so pages can consume the
 * block directly without their own empty-state branch.
 */
export async function requireCurrentBlock(): Promise<MesocycleView> {
  const block = await currentBlock();
  if (!block) redirect("/onboarding");
  return block;
}
