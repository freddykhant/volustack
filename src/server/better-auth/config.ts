import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { env } from "~/env";
import { db } from "~/server/db";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql", // or "sqlite" or "mysql"
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
      // redirectURI: "http://localhost:3000/api/auth/callback/google",
    },
  },
  // Cookies are shared by every app on `localhost`, whatever the port. Another better-auth app in dev reads
  // the default `better-auth.session_token`, finds it invalid and deletes it, signing you out of this one.
  advanced: {
    cookiePrefix: "mesodapt",
  },
});

export type Session = typeof auth.$Infer.Session;
