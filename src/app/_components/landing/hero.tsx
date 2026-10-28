import { ButtonLink } from "~/components/ui-kit/app-shell-kit";
import { SignInButton } from "~/app/_components/auth-buttons";
import { Container, Eyebrow } from "./primitives";
import { WeekDemo } from "./week-demo";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title">
      <Container className="grid items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1fr_1.25fr] lg:gap-14 lg:pt-[72px] lg:pb-14">
        <div className="animate-rise">
          <Eyebrow>Adaptive training, engineered</Eyebrow>
          <h1 id="hero-title" className="mt-3 max-w-[14ch] text-display text-balance text-fg">
            Your week rewrites itself. You stay in charge.
          </h1>
          <p className="mt-5 max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">
            An engine works out every set, rep and recovery number. A small model reads what you tell it. Miss a
            day and the block moves around it, and nothing changes until you tap.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <SignInButton />
            <ButtonLink href="#how-it-works" variant="secondary" size="lg">
              See how it adapts ↓
            </ButtonLink>
          </div>
        </div>
        <div className="min-w-0 animate-rise [animation-delay:80ms]">
          <WeekDemo />
        </div>
      </Container>
    </section>
  );
}
