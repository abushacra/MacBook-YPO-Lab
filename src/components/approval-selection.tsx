"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Wraps the To approve list in one form so several calls can be signed off at
 * once.
 *
 * The checkboxes are plain uncontrolled inputs rendered on the server inside
 * `children`; this component only counts them, by reading the form on change.
 * That keeps the cards server-rendered and avoids threading state through every
 * row. With JavaScript off the form still posts whatever is ticked.
 */
export function ApprovalSelection({
  action,
  total,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  total: number;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);

  const boxes = () =>
    Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>('input[name="call_ids"]') ?? [],
    );

  const recount = () => setSelected(boxes().filter((box) => box.checked).length);

  const toggleAll = (checked: boolean) => {
    for (const box of boxes()) box.checked = checked;
    recount();
  };

  const allSelected = selected === total && total > 0;

  return (
    <form ref={formRef} action={action} onChange={recount} className="space-y-3">
      <div className="card flex items-center justify-between gap-3 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => toggleAll(event.target.checked)}
            className="size-6 rounded accent-brand-600"
          />
          <span className="text-sm font-semibold">
            {allSelected ? "Clear all" : `Select all ${total}`}
          </span>
        </label>
        <span className="text-sm font-semibold text-muted">{selected} selected</span>
      </div>

      {children}

      {selected > 0 && (
        <div
          className="sticky z-20 -mx-4 border-t border-hairline bg-canvas/95 px-4 pt-3 pb-3 backdrop-blur"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <ApproveButton count={selected} />
        </div>
      )}
    </form>
  );
}

function ApproveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending
        ? "Approving…"
        : `Approve ${count} service call${count === 1 ? "" : "s"}`}
    </button>
  );
}
