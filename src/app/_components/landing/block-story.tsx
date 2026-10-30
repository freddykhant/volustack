import { Mark } from "~/components/ui-kit/app-shell-kit";
import { Container, Eyebrow, LandingSection } from "./primitives";

/** The mark, drawn large, read as the block it was drawn from. Static: the One Mark Rule still holds. */
export function BlockStory() {
  return (
    <LandingSection labelledBy="block-title" className="-mt-10 rounded-t-sheet-xl bg-canvas">
      <Container className="grid items-center gap-12 pt-24 pb-20 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:pt-28 lg:pb-24">
        <div>
          <Eyebrow>About the logo</Eyebrow>
          <h2 id="block-title" className="mt-3 text-landing-h2 text-fg">
            The M is a
            <br />
            training block
          </h2>
          <p className="mt-5 max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">
            Trace it from the left and it climbs for a few weeks, dips for the deload, then climbs again from a
            higher starting point. That&apos;s how every block in Mesodapt is built.
          </p>
        </div>
        <figure className="w-full max-w-[520px] lg:justify-self-end">
          <Mark strokeWidth={1.4} className="w-full text-fg" />
          <figcaption className="grid grid-cols-3 px-[12%] text-center text-meta text-fg-muted tabular-nums">
            <span>Weeks 1–4</span>
            <span>Deload</span>
            <span>Block 2</span>
          </figcaption>
        </figure>
      </Container>
    </LandingSection>
  );
}
