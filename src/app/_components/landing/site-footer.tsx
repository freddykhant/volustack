import Link from "next/link";
import type { ReactNode } from "react";

import { Mark } from "~/components/ui-kit/app-shell-kit";
import { Container } from "./primitives";

const CONNECT = [
  { label: "Email", href: "mailto:freddyhmk@gmail.com" },
  { label: "GitHub", href: "https://github.com/freddykhant" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/freddykhant240/" },
  { label: "Portfolio", href: "https://freddykhant.com" },
];

/** Shared by the landing and the legal pages. re-review: colour scheme (ink ground) */
export function SiteFooter() {
  return (
    <footer className="bg-ink text-on-ink">
      <Container className="pt-16 pb-9">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 rounded-tile">
              <span className="flex size-8 items-center justify-center rounded-tile bg-on-ink text-ink">
                <Mark className="size-5" />
              </span>
              <span className="text-section text-on-ink">Mesodapt</span>
            </Link>
            <p className="mt-3.5 max-w-[30ch] text-card-desc text-on-ink-muted">
              A training plan that keeps up when your week doesn&apos;t go to plan.
            </p>
          </div>
          <Column title="Product">
            <FooterLink href="/#how-it-works">How it works</FooterLink>
            <FooterLink href="/#engine">The engine</FooterLink>
            <FooterLink href="/">Sign in</FooterLink>
          </Column>
          <Column title="Training">
            <li className="text-card-desc text-on-ink-muted">Hypertrophy blocks</li>
            <li className="text-card-desc text-on-ink-muted">Running and cycling (soon)</li>
            <li className="text-card-desc text-on-ink-muted">Garmin and Strava (soon)</li>
          </Column>
          <Column title="Connect">
            {CONNECT.map((c) => (
              <FooterLink key={c.label} href={c.href} external={!c.href.startsWith("mailto:")}>
                {c.label}
              </FooterLink>
            ))}
          </Column>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-ink-border pt-5 text-meta text-on-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>Built by Freddy Khant</span>
          <span className="flex gap-5">
            <Link href="/privacy" className="transition-colors hover:text-on-ink">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-on-ink">
              Terms
            </Link>
            <span className="tabular-nums">© 2026 Mesodapt</span>
          </span>
        </div>
      </Container>
    </footer>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-eyebrow font-medium text-on-ink-subtle">{title}</h2>
      <ul className="mt-3.5 flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: ReactNode }) {
  const cls = "text-card-desc text-on-ink-muted transition-colors hover:text-on-ink";
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {children}
        </a>
      ) : (
        <Link href={href} className={cls}>
          {children}
        </Link>
      )}
    </li>
  );
}
