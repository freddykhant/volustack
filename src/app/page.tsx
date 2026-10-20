import { redirect } from "next/navigation";
import { Landing } from "~/app/_components/landing";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/app");

  return <Landing />;
}
