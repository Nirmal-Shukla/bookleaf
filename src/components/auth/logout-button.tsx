"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      className="min-h-11 rounded-lg border border-rule bg-surface px-4 text-sm font-semibold text-ink-soft outline-none transition-colors hover:border-leaf/50 hover:text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
      type="button"
      onClick={logout}
      disabled={isSubmitting}
    >
      {isSubmitting ? "Signing out…" : "Sign out"}
    </button>
  );
}
