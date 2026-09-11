import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";
import { api } from "~/trpc/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) redirect("/onboarding");
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email} block={block}>
      {children}
    </AppFrame>
  );
}
