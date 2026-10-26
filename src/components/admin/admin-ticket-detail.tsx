"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { usePollingJson } from "@/components/shared/use-polling-json";
import type { ApiErrorBody, ApiSuccessBody } from "@/server/http/api-response";
import type { AdminTicketData } from "@/types/admin-tickets";

import {
  AdminCategoryBadge,
  AdminClassificationBadge,
  AdminPriorityBadge,
  AdminStatusBadge,
} from "./admin-ticket-badges";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnlyFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function isAdminTicketData(value: unknown): value is AdminTicketData {
  if (!value || typeof value !== "object") return false;
  const ticket = (value as Partial<AdminTicketData>).ticket;
  return Boolean(ticket && typeof ticket.id === "string" && Array.isArray(ticket.internalNotes));
}

function mutationMessage(body: ApiErrorBody | null, fallback: string) {
  return body?.error.message ?? fallback;
}

function categoryInputValue(category: string | null) {
  const values: Record<string, string> = {
    "Royalty & Payments": "ROYALTY_PAYMENTS",
    "ISBN & Metadata Issues": "ISBN_METADATA_ISSUES",
    "Printing & Quality": "PRINTING_QUALITY",
    "Distribution & Availability": "DISTRIBUTION_AVAILABILITY",
    "Book Status & Production Updates": "BOOK_STATUS_PRODUCTION_UPDATES",
    "General Inquiry": "GENERAL_INQUIRY",
  };
  return category ? values[category] : "";
}

export function AdminTicketDetail({ ticketId }: { ticketId: string }) {
  const editorStateRef = useRef({ dirty: false, draftId: null as string | null });
  const [responseBody, setResponseBody] = useState("");
  const [responseDraftId, setResponseDraftId] = useState<string | null>(null);
  const [responseDraftVersion, setResponseDraftVersion] = useState<string | null>(null);
  const [responseDirty, setResponseDirty] = useState(false);
  const hydrateResponseDraft = useCallback((data: AdminTicketData) => {
    const draft = data.ticket.responseDraft;
    if (!draft) return;
    const editor = editorStateRef.current;
    if (editor.draftId !== draft.id) {
      editor.draftId = draft.id;
      setResponseDraftId(draft.id);
      setResponseDraftVersion(draft.updatedAt);
      if (!editor.dirty) {
        setResponseBody(draft.body);
        setResponseDirty(false);
      }
      return;
    }
    if (!editor.dirty) {
      setResponseDraftVersion(draft.updatedAt);
      setResponseBody(draft.body);
    }
  }, []);
  const { state, refresh, replaceData } = usePollingJson(
    `/api/admin/tickets/${ticketId}`,
    isAdminTicketData,
    5_000,
    hydrateResponseDraft,
  );
  const mutationRef = useRef(false);
  const draftMutationRef = useRef(false);
  const initialDraftAttemptRef = useRef(false);
  const responseKeyRef = useRef<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [draftMutating, setDraftMutating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");

  async function mutate(path: string, method: "PATCH" | "POST", body: unknown) {
    if (mutationRef.current) return null;
    mutationRef.current = true;
    setMutating(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = (await response.json()) as
        | ApiSuccessBody<AdminTicketData>
        | ApiErrorBody;
      if (!response.ok || !("data" in responseBody)) {
        setActionError(
          mutationMessage(
            "error" in responseBody ? responseBody : null,
            "The ticket could not be updated. Try again.",
          ),
        );
        return null;
      }
      replaceData(responseBody.data);
      return responseBody.data;
    } catch {
      setActionError("The request may not have completed. Retry when your connection is stable.");
      return null;
    } finally {
      mutationRef.current = false;
      setMutating(false);
    }
  }

  const mutateDraft = useCallback(async (
    path: string,
    method: "PATCH" | "POST",
    body: unknown,
    showSuccess: string | null,
  ) => {
    if (draftMutationRef.current) return null;
    draftMutationRef.current = true;
    setDraftMutating(true);
    setActionError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = (await response.json()) as
        | ApiSuccessBody<AdminTicketData>
        | ApiErrorBody;
      if (!response.ok || !("data" in responseBody)) {
        setActionError(
          mutationMessage(
            "error" in responseBody ? responseBody : null,
            "The response draft could not be updated. You can keep composing manually.",
          ),
        );
        return null;
      }
      replaceData(responseBody.data);
      if (showSuccess) setActionMessage(showSuccess);
      return responseBody.data;
    } catch {
      setActionError(
        "AI drafting is temporarily unavailable. Your text is unchanged and can still be sent manually.",
      );
      return null;
    } finally {
      draftMutationRef.current = false;
      setDraftMutating(false);
    }
  }, [replaceData]);

  const ticketData = state.data?.ticket ?? null;

  useEffect(() => {
    if (!ticketData?.shouldInitiateDraft || initialDraftAttemptRef.current) return;
    initialDraftAttemptRef.current = true;
    void mutateDraft(
      `/api/admin/tickets/${ticketId}/drafts`,
      "POST",
      { mode: "initial" },
      null,
    );
  }, [mutateDraft, ticketData?.shouldInitiateDraft, ticketId]);

  async function saveClassification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const category = String(formData.get("category") ?? "");
    const priority = String(formData.get("priority") ?? "");
    const result = await mutate(`/api/admin/tickets/${ticketId}`, "PATCH", {
      category: category || null,
      priority: priority || null,
    });
    if (result) setActionMessage("Category and priority saved.");
  }

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await mutate(`/api/admin/tickets/${ticketId}`, "PATCH", {
      status: String(formData.get("status") ?? ""),
    });
    if (result) setActionMessage("Status updated.");
  }

  async function assignToSelf() {
    const result = await mutate(`/api/admin/tickets/${ticketId}`, "PATCH", {
      assignToSelf: true,
    });
    if (result) setActionMessage("Ticket assigned to you.");
  }

  async function retryClassification() {
    const result = await mutate(
      `/api/admin/tickets/${ticketId}/classification`,
      "POST",
      {},
    );
    if (result) {
      setActionMessage(
        result.ticket.classificationState === "Completed"
          ? "AI classification completed."
          : "AI classification was retried but is still unavailable.",
      );
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutate(`/api/admin/tickets/${ticketId}/notes`, "POST", {
      body: noteBody,
    });
    if (result) {
      setNoteBody("");
      setActionMessage("Private note added.");
    }
  }

  async function sendResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    responseKeyRef.current ??= crypto.randomUUID();
    const result = await mutate(
      `/api/admin/tickets/${ticketId}/responses`,
      "POST",
      {
        body: responseBody,
        idempotencyKey: responseKeyRef.current,
        ...(responseDraftId ? { aiDraftId: responseDraftId } : {}),
      },
    );
    if (result) {
      responseKeyRef.current = null;
      setResponseBody("");
      setResponseDraftId(null);
      setResponseDraftVersion(null);
      setResponseDirty(false);
      editorStateRef.current = { dirty: false, draftId: null };
      setActionMessage("Public response sent.");
    }
  }

  async function saveResponseDraft() {
    if (!responseDraftId || !responseDraftVersion) return;
    const result = await mutateDraft(
      `/api/admin/tickets/${ticketId}/drafts/${responseDraftId}`,
      "PATCH",
      { body: responseBody, expectedUpdatedAt: responseDraftVersion },
      "Draft edits saved.",
    );
    if (result?.ticket.responseDraft) {
      setResponseDraftVersion(result.ticket.responseDraft.updatedAt);
      setResponseDirty(false);
      editorStateRef.current = {
        dirty: false,
        draftId: result.ticket.responseDraft.id,
      };
    }
  }

  async function regenerateResponseDraft() {
    if (
      responseBody.trim().length > 0 &&
      !window.confirm("Regenerate this response? The current draft text will be replaced if it has not changed while generation runs.")
    ) {
      return;
    }
    const result = await mutateDraft(
      `/api/admin/tickets/${ticketId}/drafts`,
      "POST",
      { mode: "regenerate" },
      "A new response draft was generated for review.",
    );
    if (result?.ticket.responseDraft) {
      setResponseBody(result.ticket.responseDraft.body);
      setResponseDraftId(result.ticket.responseDraft.id);
      setResponseDraftVersion(result.ticket.responseDraft.updatedAt);
      setResponseDirty(false);
      editorStateRef.current = {
        dirty: false,
        draftId: result.ticket.responseDraft.id,
      };
    }
  }

  if (state.initialLoading) {
    return <div className="mt-8 h-80 animate-pulse border border-rule bg-surface" aria-label="Loading ticket" aria-busy="true" />;
  }
  if (state.error) {
    return (
      <div className="mt-8 border-y border-rule bg-surface px-5 py-10" role="alert">
        <h2 className="font-serif text-2xl font-semibold text-ink">{state.error.status === 404 ? "Ticket not found." : "Ticket details could not be loaded."}</h2>
        <button className="mt-5 min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white" type="button" onClick={() => void refresh(true)}>Try again</button>
      </div>
    );
  }

  const ticket = state.data!.ticket;
  return (
    <div className="mt-8">
      {state.refreshFailed ? (
        <div className="mb-4 border border-warning/30 bg-warning-pale px-4 py-3 text-sm text-ink-soft" role="status">Live updates are temporarily unavailable. Your drafts remain unchanged.</div>
      ) : null}
      {actionError ? <div className="mb-4 border-l-4 border-critical bg-critical-pale px-4 py-3 text-sm text-critical" role="alert">{actionError}</div> : null}
      {actionMessage ? <div className="mb-4 border-l-4 border-leaf bg-leaf-pale px-4 py-3 text-sm font-semibold text-leaf" role="status">{actionMessage}</div> : null}

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.75fr)]">
        <div className="min-w-0 space-y-8">
          <section className="border-y border-rule bg-surface px-5 py-7 sm:px-8">
            <div className="flex flex-wrap items-center gap-2"><AdminPriorityBadge priority={ticket.priority} /><AdminStatusBadge status={ticket.status} /><AdminCategoryBadge category={ticket.category} /><AdminClassificationBadge state={ticket.classificationState} /></div>
            <h2 className="mt-4 break-words font-serif text-3xl font-semibold leading-tight text-ink">{ticket.subject}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">Created {dateFormatter.format(new Date(ticket.createdAt))} by {ticket.author.name} ({ticket.author.authorId})</p>
            <p className="mt-1 break-words text-sm text-muted">{ticket.author.email}</p>
            <div className="mt-6 border-t border-rule pt-5">
              <h3 className="text-sm font-semibold text-ink-soft">Original query</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-ink-soft">{ticket.description}</p>
            </div>
          </section>

          <section aria-labelledby="public-conversation-heading">
            <div className="border-b border-rule pb-3"><h2 id="public-conversation-heading" className="font-serif text-2xl font-semibold text-ink">Public conversation</h2><p className="mt-1 text-sm text-muted">Visible to the author.</p></div>
            <div className="divide-y divide-rule bg-surface px-5 sm:px-8">
              {ticket.responses.length === 0 ? <p className="py-7 text-sm text-muted">No public response has been sent.</p> : ticket.responses.map((response) => (
                <article key={response.id} className="py-6"><p className="text-sm font-semibold text-leaf">{response.sentBy.email}</p><p className="mt-1 text-sm text-muted">{dateFormatter.format(new Date(response.createdAt))}</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-ink-soft">{response.body}</p></article>
              ))}
            </div>
            <form className="mt-4 border border-rule bg-surface p-5 sm:p-6" onSubmit={sendResponse} aria-busy={draftMutating}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-ink" htmlFor="public-response">Review public response</label>
                  <p className="mt-1 text-sm text-muted">
                    {draftMutating
                      ? "Generating a grounded draft… You can continue typing; your text will not be replaced."
                      : ticket.responseDraft
                        ? `${ticket.responseDraft.status} draft · review every commitment before sending.`
                        : "AI drafting is unavailable or has not completed. Manual composing remains available."}
                  </p>
                </div>
                {ticket.latestDraftAttempt ? (
                  <span className="rounded-full border border-rule px-3 py-1 text-xs font-semibold text-ink-soft">
                    AI {ticket.latestDraftAttempt.status}
                  </span>
                ) : null}
              </div>
              {ticket.latestDraftAttempt?.status === "Failed" ? (
                <p className="mt-3 border-l-4 border-warning bg-warning-pale px-3 py-2 text-sm text-ink-soft" role="status">
                  {ticket.latestDraftAttempt.errorMessage ?? "Draft generation failed."} Manual writing and sending are still available.
                </p>
              ) : null}
              <textarea
                id="public-response"
                className="mt-4 w-full resize-y rounded-lg border border-rule px-3 py-3 text-base leading-7 focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/20"
                value={responseBody}
                onChange={(event) => {
                  setResponseBody(event.target.value);
                  setResponseDirty(true);
                  editorStateRef.current.dirty = true;
                  responseKeyRef.current = null;
                }}
                required
                maxLength={5000}
                rows={9}
                disabled={mutating}
                aria-describedby="public-response-help"
              />
              <p id="public-response-help" className="mt-2 text-sm text-muted">Nothing is sent until you choose Send. Retrying a send uses the same response key until delivery succeeds.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={mutating || draftMutating || responseBody.trim().length === 0}>{mutating ? "Sending…" : "Send public response"}</button>
                <button className="min-h-11 cursor-pointer rounded-lg border border-rule px-4 text-sm font-semibold text-ink-soft disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => void saveResponseDraft()} disabled={mutating || draftMutating || !responseDraftId || !responseDirty || responseBody.trim().length === 0}>Save draft</button>
                <button className="min-h-11 cursor-pointer rounded-lg border border-rule px-4 text-sm font-semibold text-ink-soft disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => void regenerateResponseDraft()} disabled={mutating || draftMutating}>{draftMutating ? "Generating…" : "Regenerate"}</button>
              </div>
              {ticket.latestDraftAttempt ? (
                <p className="mt-3 break-words text-xs leading-5 text-muted">
                  {ticket.latestDraftAttempt.model ?? "Model not available"} · {ticket.latestDraftAttempt.knowledgeBaseVersion ?? "Knowledge-base version not available"}
                  {ticket.latestDraftAttempt.inputTokens !== null || ticket.latestDraftAttempt.outputTokens !== null
                    ? ` · ${ticket.latestDraftAttempt.inputTokens ?? "?"} input / ${ticket.latestDraftAttempt.outputTokens ?? "?"} output tokens`
                    : " · Token usage not reported"}
                </p>
              ) : null}
            </form>
          </section>

          <section aria-labelledby="private-notes-heading">
            <div className="border-b border-rule pb-3"><h2 id="private-notes-heading" className="font-serif text-2xl font-semibold text-ink">Internal notes</h2><p className="mt-1 text-sm font-semibold text-critical">Private — never visible to authors.</p></div>
            <div className="divide-y divide-rule bg-critical-pale/40 px-5 sm:px-8">
              {ticket.internalNotes.length === 0 ? <p className="py-7 text-sm text-muted">No private notes yet.</p> : ticket.internalNotes.map((note) => (
                <article key={note.id} className="py-6"><p className="text-sm font-semibold text-ink-soft">{note.admin.email}</p><p className="mt-1 text-sm text-muted">{dateFormatter.format(new Date(note.createdAt))}</p><p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-ink-soft">{note.body}</p></article>
              ))}
            </div>
            <form className="mt-4 border border-critical/20 bg-critical-pale/40 p-5 sm:p-6" onSubmit={addNote}>
              <label className="text-sm font-semibold text-ink" htmlFor="internal-note">Add an internal note</label>
              <textarea id="internal-note" className="mt-2 w-full resize-y rounded-lg border border-rule bg-white px-3 py-3 text-base leading-7" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required maxLength={5000} rows={4} disabled={mutating} />
              <button className="mt-4 min-h-11 cursor-pointer rounded-lg border border-critical/30 bg-white px-5 text-sm font-semibold text-critical disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={mutating || noteBody.trim().length === 0}>{mutating ? "Working…" : "Add private note"}</button>
            </form>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-rule bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold text-ink">AI classification</h2>
            <div className="mt-3"><AdminClassificationBadge state={ticket.classificationState} /></div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Updated {dateFormatter.format(new Date(ticket.classificationStateUpdatedAt))}. Category and priority are processed together; manual overrides remain authoritative.
            </p>
            {ticket.latestClassificationAttempt ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="text-muted">Latest attempt</dt><dd className="mt-1 font-semibold text-ink-soft">{ticket.latestClassificationAttempt.status}</dd></div>
                <div><dt className="text-muted">Provider / model</dt><dd className="mt-1 break-words font-semibold text-ink-soft">{ticket.latestClassificationAttempt.provider ?? "Not available"} / {ticket.latestClassificationAttempt.model ?? "Not available"}</dd></div>
                {ticket.latestClassificationAttempt.errorMessage ? <div><dt className="text-muted">Safe failure reason</dt><dd className="mt-1 text-ink-soft">{ticket.latestClassificationAttempt.errorMessage}</dd></div> : null}
              </dl>
            ) : <p className="mt-3 text-sm text-muted">No processing attempt has been recorded yet.</p>}
            <button
              className="mt-4 min-h-11 w-full cursor-pointer rounded-lg border border-rule px-4 text-sm font-semibold text-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={mutating || ticket.classificationState !== "Failed"}
              onClick={() => void retryClassification()}
            >
              {mutating ? "Working…" : "Retry AI classification"}
            </button>
            {ticket.classificationState !== "Failed" ? <p className="mt-2 text-sm text-muted">Retry becomes available after a failed attempt.</p> : null}
          </section>

          <section className="border border-rule bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold text-ink">Ticket controls</h2>
            <button className="mt-4 min-h-11 w-full cursor-pointer rounded-lg bg-leaf px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={mutating} onClick={() => void assignToSelf()}>{ticket.assignedAdmin ? "Assign to me instead" : "Assign to me"}</button>
            <p className="mt-2 break-words text-sm leading-6 text-muted">Assigned to: {ticket.assignedAdmin?.email ?? "Nobody"}{ticket.assignedAt ? ` on ${dateFormatter.format(new Date(ticket.assignedAt))}` : ""}</p>

            <form className="mt-6 border-t border-rule pt-5" onSubmit={saveStatus}>
              <label className="text-sm font-semibold text-ink" htmlFor="admin-status">Status</label>
              <select id="admin-status" name="status" defaultValue={ticket.status === "In Progress" ? "IN_PROGRESS" : ticket.status.toUpperCase()} className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base" disabled={mutating}>
                <option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option>
              </select>
              <button className="mt-3 min-h-11 w-full cursor-pointer rounded-lg border border-rule px-4 text-sm font-semibold text-ink-soft disabled:opacity-50" type="submit" disabled={mutating}>Update status</button>
            </form>

            <form className="mt-6 border-t border-rule pt-5" onSubmit={saveClassification}>
              <label className="text-sm font-semibold text-ink" htmlFor="admin-category">Category</label>
              <select id="admin-category" name="category" defaultValue={categoryInputValue(ticket.category)} className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base" disabled={mutating}>
                <option value="">Unclassified</option><option value="ROYALTY_PAYMENTS">Royalty &amp; Payments</option><option value="ISBN_METADATA_ISSUES">ISBN &amp; Metadata Issues</option><option value="PRINTING_QUALITY">Printing &amp; Quality</option><option value="DISTRIBUTION_AVAILABILITY">Distribution &amp; Availability</option><option value="BOOK_STATUS_PRODUCTION_UPDATES">Book Status &amp; Production Updates</option><option value="GENERAL_INQUIRY">General Inquiry</option>
              </select>
              <label className="mt-4 block text-sm font-semibold text-ink" htmlFor="admin-priority">Priority</label>
              <select id="admin-priority" name="priority" defaultValue={ticket.priority?.toUpperCase() ?? ""} className="mt-2 min-h-11 w-full rounded-lg border border-rule bg-white px-3 text-base" disabled={mutating}>
                <option value="">Unclassified</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </select>
              <button className="mt-3 min-h-11 w-full cursor-pointer rounded-lg border border-rule px-4 text-sm font-semibold text-ink-soft disabled:opacity-50" type="submit" disabled={mutating}>Save classification</button>
            </form>
          </section>

          <section className="border border-rule bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold text-ink">Relevant book</h2>
            {ticket.book ? <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-muted">Title</dt><dd className="mt-1 font-semibold text-ink-soft">{ticket.book.title}</dd></div><div><dt className="text-muted">Book ID / ISBN</dt><dd className="mt-1 break-words font-semibold text-ink-soft">{ticket.book.bookId} / {ticket.book.isbn}</dd></div><div><dt className="text-muted">Publication status</dt><dd className="mt-1 font-semibold text-ink-soft">{ticket.book.status}</dd></div><div><dt className="text-muted">Publication date</dt><dd className="mt-1 font-semibold text-ink-soft">{ticket.book.publicationDate ? dateOnlyFormatter.format(new Date(`${ticket.book.publicationDate}T00:00:00.000Z`)) : "Not available"}</dd></div></dl> : <p className="mt-3 text-sm text-muted">General / Account Level</p>}
          </section>

          <section className="border border-rule bg-surface p-5">
            <h2 className="font-serif text-xl font-semibold text-ink">Status history</h2>
            <ol className="mt-4 space-y-4">{ticket.statusEvents.map((event) => <li key={event.id} className="border-l-2 border-rule pl-3 text-sm"><p className="font-semibold text-ink-soft">{event.fromStatus ? `${event.fromStatus} to ${event.toStatus}` : event.toStatus}</p><p className="mt-1 break-words text-muted">{dateFormatter.format(new Date(event.createdAt))}{event.changedBy ? ` · ${event.changedBy.email}` : ""}</p></li>)}</ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

