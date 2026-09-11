import { redirect } from "next/navigation";
import { OnboardingWizard } from "~/components/onboarding/onboarding-wizard";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await api.mesocycle.getCurrentBlock();
  if (block) redirect("/app"); // already has an active block — no re-onboarding
  return <OnboardingWizard />;
}
