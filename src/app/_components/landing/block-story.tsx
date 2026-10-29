import { Mark } from "~/components/ui-kit/app-shell-kit";
import { Container, Eyebrow, LandingSection } from "./primitives";

/** The mark, drawn large, read as the block it was drawn from. Static: the One Mark Rule still holds. */
export function BlockStory() {
  return (
    <LandingSection labelledBy="block-title" className="-mt-10 rounded-t-sheet-xl bg-canvas">
      <Container className="grid items-center gap-12 pt-24 pb-20 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:pt-28 lg:pb-24">
        <div>
          <Eyebrow>Built around the block</Eyebrow>
          <h2 id="block-title" className="mt-3 text-landing-h2 text-fg">
            Climb. Deload.
            <br />
            Come back higher.
          </h2>
          <p className="mt-5 max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">
            Every block builds for a few weeks, backs off so you can recover, then starts again from a higher floor.
            That&apos;s the whole method. It&apos;s also the logo.
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
