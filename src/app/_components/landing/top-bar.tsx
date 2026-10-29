import Link from "next/link";

import { Wordmark } from "~/components/ui-kit/app-shell-kit";
import { SignInButton } from "~/app/_components/auth-buttons";
import { Container } from "./primitives";

export function TopBar() {
  return (
    <header>
      <a
        href="#main"
        className="sr-only rounded-pill bg-surface-raised px-4 py-2 text-nav text-fg shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <Container className="flex items-center justify-between gap-4 pt-5 sm:pt-7">
        <Link href="/" aria-label="Mesodapt home" className="rounded-tile">
          <Wordmark />
        </Link>
        <nav aria-label="Page" className="flex items-center gap-6">
          <a href="#how-it-works" className="hidden text-nav text-fg-muted transition-colors hover:text-fg sm:inline">
            How it works
          </a>
          <a href="#engine" className="hidden text-nav text-fg-muted transition-colors hover:text-fg sm:inline">
            The engine
          </a>
          <SignInButton variant="secondary" size="md" label="Sign in" showIcon={false} />
        </nav>
      </Container>
    </header>
  );
}
