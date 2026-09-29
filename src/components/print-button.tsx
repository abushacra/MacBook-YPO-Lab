"use client";

/** Printing is how this report becomes a PDF — every browser offers Save as PDF. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary">
      Print / save PDF
    </button>
  );
}
