"use client";

import { useRouter } from "next/navigation";
import { FaGoogle } from "react-icons/fa";

import { authClient } from "~/server/better-auth/client";

export function SignInButton() {
    return (
        <button
            type="button"
            onClick={() =>
                authClient.signIn.social({
                    provider: "google",
                    callbackURL: "/home",
                })
            }
            className="inline-flex items-center rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
        >
            <FaGoogle className="mr-2 h-4 w-4" />
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
                        onSuccess: () => {
                            router.refresh();
                        }
                    }
                })
            }
            className="rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
        >
            Sign out
        </button>
    );
}