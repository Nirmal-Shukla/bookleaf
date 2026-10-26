import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { landingPathForRole } from "@/server/auth/authorization";
import { getPageUser } from "@/server/auth/page-authorization";

export const metadata = { title: "Sign in" };
export const instant = false;

export default async function LoginPage() {
  const user = await getPageUser();
  if (user) redirect(landingPathForRole(user.role));

  return (
    <main id="main-content" className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(30rem,0.82fr)]">
      <section className="hidden bg-ink px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="font-serif text-3xl font-semibold tracking-[-0.03em]">
          BookLeaf
        </p>
        <div className="max-w-xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#aad0bf] uppercase">
            Private support portal
          </p>
          <h1 className="mt-5 font-serif text-5xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
            Clear conversations. Accountable support.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#d8e4df]">
            A secure workspace for BookLeaf authors and support operations.
          </p>
        </div>
        <p className="text-sm text-[#a9bbb4]">
          Access is limited to provisioned accounts.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <p className="font-serif text-3xl font-semibold tracking-[-0.03em] text-ink lg:hidden">
            BookLeaf
          </p>
          <p className="mt-10 text-sm font-semibold text-leaf lg:mt-0">
            Author support portal
          </p>
          <h2 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em] text-ink">
            Welcome back
          </h2>
          <p className="mt-3 text-base leading-7 text-muted">
            Sign in with the email and password provisioned for your account.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
