import type { Metadata } from "next";

import { LegalSection } from "../legal-section";

export const metadata: Metadata = { title: "Privacy · Mesodapt" };

export default function PrivacyPage() {
  return (
    <article className="animate-rise">
      <p className="text-eyebrow font-medium text-fg-subtle">Legal</p>
      <h1 className="mt-3 text-page-title text-fg">Privacy policy</h1>
      <p className="mt-2 text-meta text-fg-muted">Last updated 29 October 2026</p>

      <div className="mt-12 flex flex-col gap-10">
        <LegalSection n={1} title="Who runs Mesodapt">
          <p>
            Mesodapt is a training planner built and run by one person: me, Freddy Khant. It isn&apos;t a company.
          </p>
          <p>
            This page says what Mesodapt actually does with your data right now. If that changes, I&apos;ll update
            the page and the date at the top. If you have a question, email me at{" "}
            <a href="mailto:freddyhmk@gmail.com">freddyhmk@gmail.com</a>.
          </p>
        </LegalSection>

        <LegalSection n={2} title="Your account">
          <p>
            You sign in with Google. Mesodapt asks Google for your basic profile and email address, nothing else.
            From that it keeps your name, your email, whether Google has verified it, a link to your profile picture,
            and when your account was created and last changed.
          </p>
          <p>
            It also keeps your Google account ID so it knows it&apos;s you next time, plus the access token and ID
            token Google sends back when you sign in. Mesodapt doesn&apos;t use those tokens for anything after
            you&apos;re signed in, and it doesn&apos;t get a refresh token, so it can&apos;t keep reaching into your
            Google account.
          </p>
        </LegalSection>

        <LegalSection n={3} title="Sign-in sessions">
          <p>
            Each time you sign in, Mesodapt records a session: a random token, the IP address you signed in from, and
            your browser&apos;s user agent (the bit of text that names your browser and operating system). A session
            lasts seven days and gets extended while you keep using the app. Signing out deletes it.
          </p>
          <p>The session lives in one cookie. There are no tracking or advertising cookies, and no analytics.</p>
        </LegalSection>

        <LegalSection n={4} title="Your training data">
          <p>To build and adjust your plan, Mesodapt stores what you give it:</p>
          <ul>
            <li>
              your profile: age, sex, height, bodyweight, activity level, goal (cut, maintain or bulk), experience and
              time zone
            </li>
            <li>the days and times you can train, and any days you block out</li>
            <li>outside activities you add, like a run or a game</li>
            <li>your training block, its weeks and sessions, and every set you log (weight, reps, RIR)</li>
            <li>your weekly check-ins, where you rate how each muscle recovered</li>
            <li>a record of each change the app proposed and whether you accepted it</li>
          </ul>
        </LegalSection>

        <LegalSection n={5} title="The coach box">
          <p>
            When you type into the coach box on the week board, your message goes to Anthropic&apos;s API, where a
            Claude model works out what you mean (which day, which session, what you want done). Along with your
            message it gets today&apos;s date, the dates left in your block and whether each is blocked, and the
            sessions in the week you&apos;re looking at. It doesn&apos;t get your name, email, profile or any
            account ID.
          </p>
          <p>
            Mesodapt keeps the text of each message (up to 500 characters), what it was understood as, and how much
            the call cost. That&apos;s so it can enforce the 50-messages-a-day limit and so I can see which phrasings
            it gets wrong. Your old messages are never shown back to you or fed into another prompt.
          </p>
        </LegalSection>

        <LegalSection n={6} title="Services Mesodapt relies on">
          <ul>
            <li>
              <b>Vercel</b> hosts the app.
            </li>
            <li>
              <b>Neon</b> hosts the database, on AWS in Sydney.
            </li>
            <li>
              <b>Google</b> handles sign-in.
            </li>
            <li>
              <b>Anthropic</b> reads coach-box messages, as described above.
            </li>
            <li>
              <b>TypeSafe</b> helps pick between options the engine has already worked out, like which way to
              re-arrange a week. It gets training figures for those options (sessions, sets, recovery ratings), never
              your name, email or account ID.
            </li>
          </ul>
          <p>Mesodapt doesn&apos;t sell your data or share it with anyone else.</p>
        </LegalSection>

        <LegalSection n={7} title="How long it's kept">
          <p>
            Your account and training data stay until you ask me to delete them. A session stops working after seven
            days without use, but the record of it (the IP address and browser) stays until you sign out or delete your
            account.
          </p>
        </LegalSection>

        <LegalSection n={8} title="Deleting your data">
          <p>
            Email me at <a href="mailto:freddyhmk@gmail.com">freddyhmk@gmail.com</a> from the address you signed up
            with and I&apos;ll delete your account. Deleting it removes your profile, your plan, your logs, your
            check-ins and your coach-box messages with it. There&apos;s no delete button in the app yet.
          </p>
        </LegalSection>

        <LegalSection n={9} title="Changes">
          <p>
            If Mesodapt starts collecting something new or sending data somewhere new, I&apos;ll update this page
            before it happens and change the date at the top.
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
