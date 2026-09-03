import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email}>
      {children}
    </AppFrame>
  );
}
