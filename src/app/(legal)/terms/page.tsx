import type { Metadata } from "next";
import Link from "next/link";

import { LegalSection } from "../legal-section";

export const metadata: Metadata = { title: "Terms · Mesodapt" };

export default function TermsPage() {
  return (
    <article className="animate-rise">
      <p className="text-eyebrow font-medium text-fg-subtle">Legal</p>
      <h1 className="mt-3 text-page-title text-fg">Terms of use</h1>
      <p className="mt-2 text-meta text-fg-muted">Last updated 29 October 2026</p>

      <div className="mt-12 flex flex-col gap-10">
        <LegalSection n={1} title="About these terms">
          <p>
            Mesodapt is a training planner built and run by one person, Freddy Khant. These terms cover your use of
            it. By using Mesodapt you agree to them. The <Link href="/privacy">privacy policy</Link> explains what
            happens to your data.
          </p>
        </LegalSection>

        <LegalSection n={2} title="Early, and provided as is">
          <p>
            Mesodapt is early software. It&apos;s provided as is, with no promise that it will always be up or always
            work correctly. Features can change or disappear, and data can be lost. If a log matters to you, keep
            your own copy.
          </p>
        </LegalSection>

        <LegalSection n={3} title="Your account">
          <p>
            You sign in with Google, so anyone who can get into your Google account can get into Mesodapt. Keep it
            secure. Your account is for you; please don&apos;t share it.
          </p>
        </LegalSection>

        <LegalSection n={4} title="Training and fuelling advice isn't medical advice">
          <p>
            Mesodapt works out training volume, schedules and readiness from what you tell it, and its cues give
            general fuelling ranges based on published sports-nutrition guidance. That&apos;s general information,
            not medical, physio or dietary advice, and it doesn&apos;t know about injuries or conditions you
            haven&apos;t told a professional about.
          </p>
          <p>
            If you have an injury, a health condition or are pregnant, check with a qualified professional before
            following a plan. If something hurts, stop. You decide what you actually lift.
          </p>
        </LegalSection>

        <LegalSection n={5} title="Fair use">
          <p>When you use Mesodapt, please don&apos;t:</p>
          <ul>
            <li>try to get into anyone else&apos;s account or data</li>
            <li>scrape it, or point bots or scripts at it</li>
            <li>
              try to get around the coach box&apos;s daily limit, or use it to run up costs on the services it depends
              on
            </li>
            <li>overload or attack the service</li>
            <li>use it for anything unlawful</li>
          </ul>
          <p>If you do, I may suspend or delete your account.</p>
        </LegalSection>

        <LegalSection n={6} title="Changes">
          <p>
            I may update these terms as Mesodapt changes. When I do, the date at the top changes too. Carrying on
            using Mesodapt after that means you accept the new version.
          </p>
        </LegalSection>

        <LegalSection n={7} title="Contact">
          <p>
            Questions, problems or ideas: <a href="mailto:freddyhmk@gmail.com">freddyhmk@gmail.com</a>.
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
