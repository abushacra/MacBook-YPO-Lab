import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import {
  deleteServiceCall,
  reviewServiceCall,
  setFollowUpResolved,
} from "@/lib/actions/calls";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ApprovalBadge, CallTypeBadge, HoursBadge } from "@/components/call-badges";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";

export const metadata = { title: "Maintenance shift · Kapa Service Log" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ServiceCallPage({ params, searchParams }: PageProps<"/calls/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const justSaved = one((await searchParams).saved) === "1";

  const { data: call } = await db()
    .from("service_calls")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!call) notFound();

  const [{ data: photos }, { data: technician }, { data: expenses }] = await Promise.all([
    db()
      .from("service_call_photos")
      .select("id, storage_path")
      .eq("service_call_id", call.id)
      .order("created_at"),
    db().from("technicians").select("name, company").eq("id", call.technician_id).maybeSingle(),
    db()
      .from("expenses")
      .select("id, amount, merchant, expense_date")
      .eq("service_call_id", call.id),
  ]);

  const { data: reviewer } = call.reviewed_by
    ? await db().from("technicians").select("name").eq("id", call.reviewed_by).maybeSingle()
    : { data: null };

  /*
   * Admins can sign off anything and revise a decision already made, which is
   * what makes them the backstop for shifts with no chief. A chief only sees
   * the panel for a pending shift routed to them that is not their own.
   */
  const canReview =
    user.is_admin ||
    (call.approval_status === "pending" &&
      user.is_chief &&
      call.routed_to_chief_id === user.id &&
      call.technician_id !== user.id);

  return (
    <div className="space-y-5">
      {justSaved && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          Maintenance shift saved.
        </p>
      )}

      <div>
        <Link href="/calls" className="text-sm font-semibold text-brand-700">
          ← All shifts
        </Link>
        <h1 className="mt-2 text-xl font-bold">{call.property_label}</h1>
        {call.space_label && <p className="text-base text-muted">{call.space_label}</p>}

        {call.property_label_2 && (
          <div className="mt-3 border-t border-hairline pt-3">
            <p className="text-lg font-bold">{call.property_label_2}</p>
            {call.space_label_2 && (
              <p className="text-base text-muted">{call.space_label_2}</p>
            )}
            <p className="mt-1 text-xs text-muted">Second property on this call</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CallTypeBadge value={call.call_type} />
        <HoursBadge value={call.hours_type} />
        <ApprovalBadge value={call.approval_status} />
      </div>

      {call.approval_status !== "pending" && (
        <p className="text-sm text-muted">
          {call.approval_status === "approved" ? "Approved" : "Sent back"} by{" "}
          <span className="font-semibold text-ink">{reviewer?.name ?? "a reviewer"}</span>
          {call.reviewed_at ? ` on ${formatDateTime(call.reviewed_at)}` : ""}.
          {call.review_note ? ` "${call.review_note}"` : ""}
        </p>
      )}

      {canReview && (
        <form action={reviewServiceCall} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={call.id} />
          <p className="font-semibold">
            {call.approval_status === "pending" ? "Your approval" : "Change this decision"}
          </p>
          {call.technician_id === user.id && (
            <p className="text-xs text-muted">
              This is your own shift. You can sign it off because you are an admin.
            </p>
          )}
          <textarea
            name="review_note"
            rows={2}
            placeholder="Optional note — required reading if you send it back."
            className="textarea"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              name="decision"
              value="approved"
              className="btn bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Approve
            </button>
            <button type="submit" name="decision" value="rejected" className="btn-danger">
              Send back
            </button>
          </div>
        </form>
      )}

      <dl className="card divide-y divide-hairline text-sm">
        <Row label="Date" value={formatDate(call.call_date)} />
        <Row
          label="Logged by"
          value={`${technician?.name ?? "Unknown"}${technician?.company ? ` · ${technician.company}` : ""}`}
        />
        <Row label="Logged at" value={formatDateTime(call.created_at)} />
        {/* Pay rates stay admin-only; a vendor still sees what they quoted. */}
        {call.billed_amount != null &&
          (user.is_admin || (user.kind !== "in_house" && call.technician_id === user.id)) && (
            <Row
              label={call.billed_label ?? "Billed"}
              value={formatMoney(call.billed_amount)}
            />
          )}
      </dl>

      {call.description && (
        <section>
          <h2 className="section-heading mb-2">Work completed</h2>
          <p className="card px-4 py-3 text-sm whitespace-pre-wrap">{call.description}</p>
        </section>
      )}

      {call.follow_up_needed && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <h2 className="text-sm font-bold text-violet-900">Follow-up needed</h2>
          {call.follow_up_notes && (
            <p className="mt-1.5 text-sm whitespace-pre-wrap text-violet-900">
              {call.follow_up_notes}
            </p>
          )}
          <form action={setFollowUpResolved} className="mt-3">
            <input type="hidden" name="id" value={call.id} />
            <SubmitButton className="btn-secondary w-full" pendingLabel="Updating…">
              Mark follow-up complete
            </SubmitButton>
          </form>
        </section>
      )}

      {photos && photos.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Photos and files</h2>
          <ul className="grid grid-cols-2 gap-2">
            {photos.map((attachment) => {
              const href = `/api/media?bucket=service-photos&path=${encodeURIComponent(attachment.storage_path)}`;
              const isPdf = attachment.storage_path.toLowerCase().endsWith(".pdf");

              return (
                <li key={attachment.id}>
                  <a href={href} target="_blank" rel="noreferrer" className="block">
                    {isPdf ? (
                      <span className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-hairline bg-white">
                        <PdfIcon />
                        <span className="text-xs font-semibold text-brand-700">Open PDF</span>
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- served via a short-lived signed URL, not optimizable
                      <img
                        src={href}
                        alt="Maintenance shift photo"
                        loading="lazy"
                        className="aspect-square w-full rounded-xl border border-hairline object-cover"
                      />
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {user.is_admin && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-bold text-red-900">Delete this shift</h2>
          <p className="mt-1 text-xs text-red-800">
            Removes the shift and its photos and files for good. A receipt logged
            against it is kept and simply unlinked.
          </p>
          <form action={deleteServiceCall} className="mt-3">
            <input type="hidden" name="id" value={call.id} />
            <ConfirmButton
              confirmLabel="Tap again to delete this shift"
              className="btn-danger w-full"
              confirmClassName="btn w-full bg-red-600 text-white hover:bg-red-700"
            >
              Delete shift
            </ConfirmButton>
          </form>
        </section>
      )}

      {expenses && expenses.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Charges on this shift</h2>
          <ul className="card divide-y divide-hairline">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{expense.merchant ?? "Charge"}</span>
                <span className="text-sm font-semibold">{formatMoney(expense.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PdfIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-10 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z" />
      <path d="M14 3v4h4" />
      <path d="M9 13.5h6M9 16.5h4" />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
