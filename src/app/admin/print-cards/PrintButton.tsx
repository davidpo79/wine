"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded bg-[#0F2340] px-4 py-2 font-semibold text-white">
      Print
    </button>
  );
}
