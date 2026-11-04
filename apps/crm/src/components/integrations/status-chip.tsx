import type { DisplayStatus } from "@tekinsof/core/integrations/overview";
import { CircleAlert, CircleCheck, CircleDashed, type LucideIcon, Unplug } from "lucide-react";

const styles: Record<DisplayStatus, { label: string; icon: LucideIcon; className: string }> = {
  conectado: { label: "Conectado", icon: CircleCheck, className: "text-success" },
  pendiente: { label: "Pendiente", icon: CircleDashed, className: "text-warning" },
  error: { label: "Error", icon: CircleAlert, className: "text-destructive" },
  desconectado: { label: "Desconectado", icon: Unplug, className: "text-fg-muted" },
};

// Icon and text carry the state; color only reinforces it.
export function StatusChip({ status }: { status: DisplayStatus }) {
  const { label, icon: Icon, className } = styles[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-xs font-semibold ${className}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}

export function Monogram({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] font-display text-lg font-bold ${
        muted
          ? "border border-dashed border-border bg-surface text-fg-muted"
          : "bg-surface-accent text-fg"
      }`}
    >
      {text}
    </span>
  );
}
