import { Panel, Wordmark } from "~/components/ui-kit/app-shell-kit";
import { SignInButton } from "~/app/_components/auth-buttons";

const STEPS: { title: string; detail: string }[] = [
  {
    title: "Tell it how you train",
    detail: "Your days, split and experience. The engine builds your block from there.",
  },
  {
    title: "Log what you lift",
    detail: "Weight × reps × RIR, set by set. What you did is the record.",
  },
  {
    title: "Miss a day, the week reflows",
    detail: "You get a make-up, partial or let-go option. Accept it, hold or edit.",
  },
];

/** Signed-out landing. The session redirect lives in `page.tsx`; this is markup only. */
export function Landing() {
  return (
    <div className="bg-atmosphere flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 pt-6 sm:px-8 sm:pt-8">
        <Wordmark />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-start px-4 pt-14 pb-16 sm:px-8 sm:pt-20 lg:pt-[14vh] lg:pb-24">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          <section className="animate-rise flex flex-col items-start">
            <p className="text-eyebrow mb-4 font-medium text-fg-subtle">For self-coached lifters</p>
            <h1 className="text-display max-w-[13ch] text-balance text-fg">You train. Mesodapt manages the rest.</h1>
            <p className="mt-5 max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">
              One adaptive schedule for your whole block. Miss a session and the week reflows around it, and
              nothing changes until you tap.
            </p>
            <div className="mt-8">
              <SignInButton />
            </div>
          </section>

          <Panel
            as="section"
            padding="lg"
            aria-labelledby="how-it-works"
            className="animate-rise w-full [animation-delay:80ms] lg:max-w-[460px] lg:justify-self-end"
          >
            <h2 id="how-it-works" className="text-card-title text-fg">
              How it works
            </h2>
            <ol className="mt-5 flex flex-col">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="flex gap-4 border-t border-border-subtle py-4 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-sunken text-meta font-medium tabular-nums text-fg-soft"
                  >
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5 pt-[3px]">
                    <span className="text-list text-fg">{s.title}</span>
                    <span className="text-card-desc text-fg-muted">{s.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </main>
    </div>
  );
}
