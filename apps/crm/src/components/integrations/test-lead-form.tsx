"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import type { TestState } from "@/app/(app)/configuracion/integraciones/actions";
import { Button, Field, Select } from "@/components/ui";

type Props = {
  action: (prev: TestState, formData: FormData) => Promise<TestState>;
  googleForms: { id: string; name: string }[];
};

// Runs a test lead through the real pipeline and shows each step's outcome.
export function TestLeadForm({ action, googleForms }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-4 md:grid-cols-3 md:items-end">
        <Field id="test-integration" label="Integración">
          <Select name="integration" defaultValue="tiktok">
            <option value="tiktok">TikTok Lead Ads</option>
            <option value="google">Google Lead Forms</option>
          </Select>
        </Field>
        <Field id="test-form" label="Formulario (solo Google)">
          <Select name="adFormId" defaultValue="">
            <option value="">El más reciente</option>
            {googleForms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar lead de prueba"}
        </Button>
      </form>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <div
          role="status"
          className="space-y-3 rounded-[var(--radius-control)] border border-border bg-surface p-4"
        >
          <ol className="space-y-2">
            {state.run.steps.map((step) => (
              <li key={step.label} className="flex items-start gap-2 text-sm">
                {step.ok ? (
                  <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
                ) : (
                  <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
                )}
                <span>
                  <span className="font-medium">{step.label}</span>
                  {step.ok ? ": correcto" : ": falló"}
                  {step.detail ? <span className="block text-fg-muted">{step.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {state.run.leadId ? (
            <Link
              href={`/leads/${state.run.leadId}`}
              className="text-sm font-medium text-link underline"
            >
              Ver el lead de prueba
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
