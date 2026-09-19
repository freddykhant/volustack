import { redirect } from "next/navigation";
import { SignInButton } from "~/app/_components/auth-buttons";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">Hi there</h1>
      <SignInButton />
    </main>
  );
}
