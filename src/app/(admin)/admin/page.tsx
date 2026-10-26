import Link from "next/link";

export const metadata = { title: "Operations workspace" };

export default function AdminHomePage() {
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold text-leaf">Operations workspace</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        Manual support operations, ready for triage.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Review author requests, assign ownership, record private context, and
        send public responses manually. AI classification and grounded response
        drafts assist the workflow, while every public message still requires
        explicit admin review and sending.
      </p>
      <Link className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-leaf px-5 text-sm font-semibold text-white" href="/admin/tickets">Open support queue</Link>
    </section>
  );
}
