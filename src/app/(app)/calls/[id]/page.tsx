import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { setFollowUpResolved } from "@/lib/actions/calls";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { CallTypeBadge, HoursBadge } from "@/components/call-badges";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Service call · Kapa Service Log" };

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

  return (
    <div className="space-y-5">
      {justSaved && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          Service call saved.
        </p>
      )}

      <div>
        <Link href="/calls" className="text-sm font-semibold text-brand-700">
          ← All calls
        </Link>
        <h1 className="mt-2 text-xl font-bold">{call.property_label}</h1>
        {call.space_label && <p className="text-base text-muted">{call.space_label}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CallTypeBadge value={call.call_type} />
        <HoursBadge value={call.hours_type} />
      </div>

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
                        alt="Service call photo"
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

      {expenses && expenses.length > 0 && (
        <section>
          <h2 className="section-heading mb-2">Charges on this call</h2>
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
