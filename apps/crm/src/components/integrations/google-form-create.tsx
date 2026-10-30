"use client";

import { TriangleAlert } from "lucide-react";
import { useActionState } from "react";
import type { CreateFormState } from "@/app/(app)/configuracion/integraciones/actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { CopyField } from "./copy-button";

type Props = {
  action: (prev: CreateFormState, formData: FormData) => Promise<CreateFormState>;
  campaigns: { id: string; name: string }[];
};

// The key exists in plain text only in this response; a reload or a new form clears it for good.
export function GoogleFormCreate({ action, campaigns }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const fields = state.status === "error" ? state.fields : undefined;
  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-4 md:grid-cols-3 md:items-end">
        <Field id="google-name" label="Nombre del formulario" error={fields?.name}>
          <Input name="name" required maxLength={160} autoComplete="off" />
        </Field>
        <Field id="google-campaign" label="Campaña" error={fields?.campaignId}>
          <Select name="campaignId" defaultValue="">
            <option value="">Sin campaña (mapear después)</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear formulario"}
        </Button>
      </form>

      {state.status === "error" && !fields ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {state.status === "created" ? (
        <div
          role="status"
          className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5"
        >
          <p className="font-display font-semibold">Formulario «{state.name}» creado</p>
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            Copia la clave ahora: no volverás a verla. Si la pierdes, crea otro formulario.
          </p>
          <div className="space-y-1">
            <p className="text-sm font-medium">URL del webhook</p>
            <CopyField value={state.webhookUrl} label="Copiar URL" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Clave</p>
            <CopyField value={state.key} label="Copiar clave" />
          </div>
          <p className="text-sm text-fg-muted">
            En Google Ads, abre el formulario de clientes potenciales → Integración de webhook y
            pega ambos valores. Luego usa «Enviar datos de prueba».
          </p>
        </div>
      ) : null}
    </div>
  );
}
