import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "~/components/ui-kit/app-shell-kit";
import { Container } from "~/app/_components/landing/primitives";
import { SiteFooter } from "~/app/_components/landing/site-footer";

/** Privacy and terms. Public to everyone, signed in or not, so no session redirect here. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-landing bg-atmosphere flex min-h-screen flex-col bg-canvas text-fg">
      <header>
        <Container className="pt-5 sm:pt-7">
          <Link href="/" aria-label="Mesodapt home" className="inline-flex rounded-tile">
            <Wordmark />
          </Link>
        </Container>
      </header>
      <main id="main" className="mx-auto w-full max-w-[800px] flex-1 px-4 pt-14 pb-24 sm:px-8 sm:pt-20">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
