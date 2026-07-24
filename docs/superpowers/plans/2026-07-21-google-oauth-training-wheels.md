# Google OAuth via BetterAuth — Implementation Plan

## Context

This app already has BetterAuth wired up (`src/server/better-auth/`), with a Postgres/Prisma adapter and email/password sign-in enabled. Google sign-in is scaffolded but commented out — `config.ts` has a commented `google` block, and `env.js` has the matching env vars commented out too. You've already created a Google Cloud OAuth client and the credentials are sitting in `.env`:

```
BETTER_AUTH_GOOGLE_CLIENT_ID="2706287*..."
BETTER_AUTH_GOOGLE_CLIENT_SECRET="***ZIENt"
```

The database already has `User`, `Account`, `Session`, and `Verification` tables from a prior migration — Google accounts slot into the existing `Account` table, so **no migration is needed**.

By the end of this plan: visiting `/` with no active session shows a "Sign in with Google" button; clicking it round-trips through Google and lands you back on `/` signed in, with your name/email shown and a "Sign out" button.

## Task 1: Add the Google env vars to the validated env schema

*Why this matters:* `src/env.js` *uses* `@t3-oss/env-nextjs` *to validate* `process.env` *at boot — any var not declared there throws a Zod error the moment you try to read it via* `env.X`*, even if it's set in* `.env`*. The vars are already in* `.env` *but* `env.js` *doesn't know about them yet.*

**Files:**

- Modify: `src/env.js`

> **Concept:** `@t3-oss/env-nextjs`
>
> This project doesn't read `process.env.FOO` directly. Instead `src/env.js` declares
> a Zod schema for every environment variable, and the rest of the app imports a
> validated `env` object from `~/env`. Server-only vars go in the `server` block;
> anything the browser needs goes in `client` (and must be prefixed `NEXT_PUBLIC_`).
> Every var in `server`/`client` must also be echoed into `runtimeEnv` — that's the part
> that actually reads `process.env`, because Next.js inlines env vars at build time and
> can't do dynamic property access in edge/client bundles.
> Docs: [https://env.t3.gg/docs/nextjs](https://env.t3.gg/docs/nextjs)

- [x] **Step 1: Uncomment and require the two Google vars in the** `server` **schema**

Open `src/env.js`. Find these two commented lines (right after `BETTER_AUTH_SECRET`):

```js
    // BETTER_AUTH_GOOGLE_CLIENT_ID: z.string(),
    // BETTER_AUTH_GOOGLE_CLIENT_SECRET: z.string(),
```

Uncomment them so the `server` block reads:

```js
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    BETTER_AUTH_GOOGLE_CLIENT_ID: z.string(),
    BETTER_AUTH_GOOGLE_CLIENT_SECRET: z.string(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
```

- [x] **Step 2: Uncomment the matching entries in** `runtimeEnv`

Lower in the same file, find:

```js
    // BETTER_AUTH_GOOGLE_CLIENT_ID: process.env.BETTER_AUTH_GOOGLE_CLIENT_ID,
    // BETTER_AUTH_GOOGLE_CLIENT_SECRET:
    //   process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
```

Uncomment so `runtimeEnv` reads:

```js
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_GOOGLE_CLIENT_ID: process.env.BETTER_AUTH_GOOGLE_CLIENT_ID,
    BETTER_AUTH_GOOGLE_CLIENT_SECRET:
      process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
```

- [x] **Step 3: Document the vars in** `.env.example`

`.env.example` is committed to git (unlike `.env`) so teammates know which vars to set. Open `.env.example` and add a Google section. It currently only documents a GitHub section that isn't wired into any code — leave that alone, just add Google above the Prisma section:

```
# Better Auth Google OAuth
BETTER_AUTH_GOOGLE_CLIENT_ID=""
BETTER_AUTH_GOOGLE_CLIENT_SECRET=""
```

- [x] **Step 4: Verify**

Run the typecheck/lint script (this project's `check` script runs both):

```bash
pnpm check
```

1. It should complete with no "Invalid environment variables" error.
2. If you see a Zod error naming `BETTER_AUTH_GOOGLE_CLIENT_ID`, your `.env` file's variable name doesn't match exactly — go re-check it against Step 1's spelling.

**Troubleshooting**

- *"Invalid environment variables" thrown at startup* — One of the two `runtimeEnv` lines wasn't uncommented, or has a typo. The schema in `server` and the mapping in `runtimeEnv` must both list the var, spelled identically.
- `pnpm dev` *still doesn't pick up the new vars* — Next.js only reads `.env` at process start. Stop and restart `pnpm dev`.

- [x] **Step 5: Commit**

```bash
git add src/env.js .env.example
git commit -m "chore: validate Google OAuth env vars"
```

---



## Task 2: Enable Google in the BetterAuth server config

*Why this matters:* `env.js` *only makes the credentials available — BetterAuth itself doesn't know to offer Google as a sign-in option until you register it under* `socialProviders`*.*

**Files:**

- Modify: `src/server/better-auth/config.ts`

- [x] **Step 1: Uncomment the** `google` **provider block**

Open `src/server/better-auth/config.ts`. It currently has:

```ts
  socialProviders: {
    // google: {
    //   clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID,
    //   clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
    //   redirectURI: "http://localhost:3000/api/auth/callback/google",
    // },
  },
```

Replace it with:

```ts
  socialProviders: {
    google: {
      clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
    },
  },
```

Note the dropped `redirectURI` line — the commented-out version hardcoded it to `http://localhost:3000/...`, which would silently break in any non-localhost environment (staging, prod, a teammate's machine on a different port). BetterAuth builds the correct callback URL itself from the incoming request when `redirectURI` is omitted.

> **Concept: BetterAuth's OAuth callback route**
>
> The catch-all route at `src/app/api/auth/[...all]/route.ts` (already in this repo,
> not something you need to touch) forwards every `/api/auth/*` request into BetterAuth's
> handler. For Google specifically, that means `/api/auth/callback/google` is the URL
> Google redirects back to after the user approves access. This exact path — including
> the host and port — must be registered in Google Cloud Console as an
> **Authorized redirect URI**, or Google will reject the callback with `redirect_uri_mismatch`.
> Docs: [https://www.better-auth.com/docs/authentication/google](https://www.better-auth.com/docs/authentication/google)

- [x] **Step 2: Confirm the redirect URI is authorized in Google Cloud Console**

You said the client ID/secret are already created. Double check the redirect URI is registered:

1. Go to Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID.
2. Under "Authorized redirect URIs", confirm `http://localhost:3000/api/auth/callback/google` is listed.
3. If it's missing, add it and click Save (changes can take a minute to propagate).

- [x] **Step 3: Verify**

```bash
pnpm typecheck
```

This should pass with no errors from `config.ts` — `env.BETTER_AUTH_GOOGLE_CLIENT_ID` now resolves to a required `string` instead of erroring as an unknown property.

**Troubleshooting**

- `Property 'BETTER_AUTH_GOOGLE_CLIENT_ID' does not exist on type...'` — Task 1 wasn't completed first; `env.js` still has the property commented out.
- *Google shows "Error 400: redirect_uri_mismatch" when you test in Task 4* — the URI in Google Cloud Console doesn't exactly match `http://localhost:3000/api/auth/callback/google` (trailing slash, `https` vs `http`, or wrong port are the usual culprits).

- [x] **Step 4: Commit**

```bash
git add src/server/better-auth/config.ts
git commit -m "feat: enable Google as a BetterAuth social provider"
```

---



## Task 3: Add sign-in / sign-out UI to the home page

*Why this matters: the backend now accepts Google sign-in, but there's no button anywhere that triggers it.* `src/app/page.tsx` *is a Server Component (it already calls* `getSession()`*), but the click handler that kicks off the OAuth redirect has to run in the browser — that means a small Client Component.*

**Files:**

- Create: `src/app/_components/auth-buttons.tsx`
- Modify: `src/app/page.tsx`

> **Concept:** `"use client"` **and the server/client boundary**
>
> Every file in `src/app/` is a Server Component by default — it renders on the server
> and can't use `onClick`, `useState`, or browser APIs. Adding `"use client"` as the
> first line of a file opts it (and everything it imports) into rendering in the browser
> instead. The pattern here is standard for Next.js App Router: keep data-fetching
> (`getSession()`) in the server component, and push only the interactive bits
> (buttons with `onClick`) into a small client component that the server component renders.
> Docs: [https://nextjs.org/docs/app/building-your-application/rendering/client-components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)

- [x] **Step 1: Create the client component with both buttons**

Create `src/app/_components/auth-buttons.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { authClient } from "~/server/better-auth/client";

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() =>
        authClient.signIn.social({
          provider: "google",
          callbackURL: "/",
        })
      }
      className="rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
    >
      Sign in with Google
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() =>
        authClient.signOut({
          fetchOptions: {
            onSuccess: () => router.refresh(),
          },
        })
      }
      className="rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
    >
      Sign out
    </button>
  );
}
```

`authClient.signIn.social(...)` redirects the whole page to Google — there's no promise to await. `authClient.signOut(...)` is a background fetch, so it needs the `router.refresh()` in `onSuccess` to make the server re-run `getSession()` and re-render `page.tsx` in its signed-out state; without it the page would keep showing your name until a manual reload.

The `rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20` classes aren't invented — they're copied from the existing submit button in `src/app/_components/post.tsx:42`, so the new buttons match the rest of the app's visual style exactly.

- [x] **Step 2: Wire the buttons into** `src/app/page.tsx`

Replace the full contents of `src/app/page.tsx` with:

```tsx
import { SignInButton, SignOutButton } from "~/app/_components/auth-buttons";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
        Hi Aaron
      </h1>
      {session ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg">
            Signed in as {session.user.name} ({session.user.email})
          </p>
          <SignOutButton />
        </div>
      ) : (
        <SignInButton />
      )}
    </main>
  );
}
```

This drops the unused `Link`, `redirect`, `auth`, and `api`/`HydrateClient` imports that were sitting unused in the original file (the `redirect("/login")` call was commented out and referenced a route that doesn't exist) — keep the file focused on what it actually does now.

- [x] **Step 3: Verify**

```bash
pnpm dev
```

1. Visit `http://localhost:3000/`. You should see "Hi Aaron" and a "Sign in with Google" button — no session yet.
2. Click it. You should be redirected to Google's account chooser / consent screen.
3. Approve access. You should land back on `http://localhost:3000/` showing "Signed in as [your name] ([your email])" and a "Sign out" button.
4. Click "Sign out". The page should update back to the "Sign in with Google" button without a manual refresh.
5. Open Prisma Studio and confirm a row was created in both `User` and `Account` (the `Account` row's `providerId` should be `google`):

```bash
pnpm db:studio
```

**Troubleshooting**

- *Clicking "Sign in with Google" does nothing* — open the browser console. If you see a CORS or network error, confirm `pnpm dev` is actually running on port 3000 (BetterAuth's client defaults to same-origin, so this only breaks if you're running on a different port).
- *Redirected to Google then immediately bounced back with an error page* — check the URL for `error=redirect_uri_mismatch` and revisit Task 2 Step 2.
- *Signed in, but "Sign out" doesn't update the page* — confirm `SignOutButton` still has the `fetchOptions.onSuccess` callback calling `router.refresh()`; without it the server component won't re-fetch the session.
- `session.user.name` *shows* `undefined` — Google didn't return a name, which is unusual but can happen with some Workspace privacy settings. Not a bug in this code; `session.user.email` will still be populated.

- [x] **Step 4: Commit**

```bash
git add src/app/_components/auth-buttons.tsx src/app/page.tsx
git commit -m "feat: add Google sign-in/sign-out UI to the home page"
```

---



## Done

At this point Google OAuth is fully wired: env validated, BetterAuth configured, and a working sign-in/sign-out UI on `/`. The `src/app/home/page.tsx` file was left untouched since it looked like separate in-progress work — nothing in this plan depends on it or conflicts with it.