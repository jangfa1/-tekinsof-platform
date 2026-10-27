"use client";

export default function SegmentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-border p-8">
      <p className="font-display text-lg font-semibold">Algo salió mal al cargar esta página.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 min-h-9 rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
      >
        Reintentar
      </button>
    </div>
  );
}
