import { Wordmark } from "~/components/ui-kit/app-shell-kit";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Onboarding lives outside /app, so it doesn't get AppShell's ground — apply
  // the app defaults here (the same classes AppShell/AppCanvas set on the body).
  return (
    <div className="bg-atmosphere min-h-screen bg-canvas font-sans text-fg antialiased">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 pt-6 sm:px-8 sm:pt-8">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20 sm:pt-16">{children}</main>
    </div>
  );
}
