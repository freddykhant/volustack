export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Onboarding lives outside /app, so it doesn't get AppShell's ground — apply
  // the app defaults here (the same classes AppShell/AppCanvas set on the body).
  return (
    <div className="min-h-screen bg-canvas font-sans text-fg antialiased">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
        {children}
      </div>
    </div>
  );
}
