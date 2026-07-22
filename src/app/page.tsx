import { SignInButton, SignOutButton } from "~/app/_components/auth-buttons";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
        Hi there
      </h1>
      {session ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg">
            Signed in as {session.user.name} ({session.user.email})
          </p>
          <SignOutButton />
        </div>
      ) : (
        <SignInButton />
      )}
    </main>
  );
}