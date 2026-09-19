import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";
import { currentBlock } from "~/server/mesocycle/current-block";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await currentBlock();
  if (!block) redirect("/onboarding");
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email} block={block}>
      {children}
    </AppFrame>
  );
}
