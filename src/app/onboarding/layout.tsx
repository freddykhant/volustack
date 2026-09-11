export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      {children}
    </div>
  );
}
