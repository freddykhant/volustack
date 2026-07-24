import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/better-auth";
import { getSession } from "~/server/better-auth/server";
import { api, HydrateClient } from "~/trpc/server";
import { SignOutButton } from "../_components/auth-buttons";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          What is up {session.user.name}
        </h1>
      </div>
      <SignOutButton />
    </main>
  );
}
