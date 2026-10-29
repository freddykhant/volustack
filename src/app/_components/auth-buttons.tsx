"use client";

import { useEffect, useState } from "react";
import { FaGoogle } from "react-icons/fa";

import { Button } from "~/components/ui-kit/app-shell-kit";
import { authClient } from "~/server/better-auth/client";

export function SignInButton({
  variant = "primary",
  size = "lg",
  label = "Continue with Google",
  showIcon = true,
}: {
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  label?: string;
  showIcon?: boolean;
} = {}) {
  const [pending, setPending] = useState(false);

  // Coming back from Google restores this page from the bfcache with the spinner still on; clear it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function signIn() {
    setPending(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/app",
      });
      // On success the browser navigates away; only an error lands back here.
      if (res?.error) setPending(false);
    } catch {
      setPending(false);
    }
  }

  return (
    <Button variant={variant} size={size} loading={pending} onClick={() => void signIn()}>
      {/* The kit's `icon` prop takes a Lucide icon; the brand mark is passed as a child and yields to the spinner. */}
      {pending || !showIcon ? null : <FaGoogle className="size-4" aria-hidden />}
      {label}
    </Button>
  );
}
