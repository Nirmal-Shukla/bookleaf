import { CreateTicketForm } from "@/components/tickets/create-ticket-form";

export const metadata = { title: "Create a support ticket" };

export default function NewAuthorTicketPage() {
  return (
    <section className="max-w-5xl">
      <p className="text-sm font-semibold text-leaf">Create a ticket</p>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        Tell BookLeaf what you need help with.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Connect the request to one of your books, or choose General / Account Level for an account-wide question.
      </p>
      <CreateTicketForm />
    </section>
  );
}

