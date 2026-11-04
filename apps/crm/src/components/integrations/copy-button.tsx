"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Copies a URL or key; the visible label changes so screen readers hear the result too.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm font-medium hover:bg-surface"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span aria-live="polite">{copied ? "Copiado" : label}</span>
    </button>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <code className="w-full break-all rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
