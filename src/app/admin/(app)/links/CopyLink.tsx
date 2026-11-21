"use client";

import { useState } from "react";

/** Copies a full page address (optionally with a UTM tag) and says so for 1.5 s. */
export function CopyLink({ url, label = "Copy" }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded border px-2 py-1 text-xs hover:bg-paper"
      title={url}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
