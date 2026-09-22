"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/submit-button";

const DISARM_AFTER_MS = 4000;

/**
 * Two-tap submit for destructive actions. The first tap only arms the button
 * and re-labels it, so a mis-tap on a phone cannot delete anything; the arming
 * lapses on its own if the second tap never comes.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  pendingLabel,
  className = "btn-danger min-h-10 px-3 text-sm",
  confirmClassName = "btn min-h-10 bg-red-600 px-3 text-sm text-white hover:bg-red-700",
}: {
  children: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  className?: string;
  confirmClassName?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  if (pending) {
    return (
      <button type="submit" className={confirmClassName} disabled>
        <Spinner />
        {pendingLabel ?? "Deleting…"}
      </button>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          setArmed(true);
          window.setTimeout(() => setArmed(false), DISARM_AFTER_MS);
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <button type="submit" className={confirmClassName}>
      {confirmLabel}
    </button>
  );
}
