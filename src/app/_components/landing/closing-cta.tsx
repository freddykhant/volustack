import { Mark } from "~/components/ui-kit/app-shell-kit";
import { SignInButton } from "~/app/_components/auth-buttons";
import { Container, LandingSection } from "./primitives";
import { ReplayLink } from "./replay-link";

export function ClosingCta() {
  return (
    <LandingSection labelledBy="cta-title" className="bg-atmosphere">
      <Container className="pt-24 pb-28">
        <span className="flex size-16 items-center justify-center rounded-[18px] bg-ink text-on-ink">
          <Mark className="size-10" />
        </span>
        <h2 id="cta-title" className="mt-7 max-w-[16ch] text-display text-balance text-fg">
          Your next block deserves a real plan.
        </h2>
        <p className="mt-5 max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">
          Tell it how you train and it builds the block. After that, it keeps the block on track so you don&apos;t
          have to.
        </p>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <SignInButton />
          <ReplayLink />
        </div>
      </Container>
    </LandingSection>
  );
}
