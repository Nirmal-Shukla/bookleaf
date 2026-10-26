"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type LoginResponse =
  | { data: { redirectTo: string } }
  | { error: { message: string } };

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          rememberMe: form.get("rememberMe") === "on",
        }),
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !("data" in result)) {
        setError(
          "error" in result
            ? result.error.message
            : "Sign in could not be completed.",
        );
        return;
      }

      router.replace(result.data.redirectTo);
      router.refresh();
    } catch {
      setError("The portal could not be reached. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-9 grid gap-5" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink-soft" htmlFor="email">
          Email address
        </label>
        <input
          className="min-h-12 rounded-lg border border-rule bg-surface px-4 text-base text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink-soft" htmlFor="password">
          Password
        </label>
        <input
          className="min-h-12 rounded-lg border border-rule bg-surface px-4 text-base text-ink outline-none transition-colors focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-soft">
        <input className="size-4 accent-leaf" type="checkbox" name="rememberMe" />
        Keep me signed in on this device
      </label>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        className="min-h-12 rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#1f5443] focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
