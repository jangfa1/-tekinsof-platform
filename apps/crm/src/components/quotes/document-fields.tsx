import { Field, Textarea } from "@/components/ui";

// The printed texts of a quote: cover letter, commercial conditions and remarks. Editable on a
// draft (inside the editor form, saved with the items), read-only afterwards.

export type DocumentTexts = {
  intro: string | null;
  paymentTerms: string | null;
  deliveryTime: string | null;
  warranty: string | null;
  scope: string | null;
  exclusions: string | null;
  observations: string | null;
  terms: string | null;
  notes: string | null;
};

export const documentFieldLabels: Array<{
  name: keyof DocumentTexts;
  label: string;
  help?: string;
  wide?: boolean;
}> = [
  { name: "intro", label: "Mensaje de presentación", wide: true },
  { name: "paymentTerms", label: "Forma de pago" },
  { name: "deliveryTime", label: "Tiempo de entrega" },
  { name: "warranty", label: "Garantía" },
  { name: "scope", label: "Alcances" },
  { name: "exclusions", label: "Exclusiones" },
  { name: "terms", label: "Otras condiciones", help: "Opcional" },
  { name: "observations", label: "Observaciones", help: "Una por línea", wide: true },
  { name: "notes", label: "Notas adicionales", help: "Se imprimen con las observaciones" },
];

export function DocumentFields({
  texts,
  editable,
  prefix = "doc.",
}: {
  texts: DocumentTexts;
  editable: boolean;
  prefix?: string;
}) {
  if (!editable) {
    return (
      <dl className="grid gap-4 sm:grid-cols-2">
        {documentFieldLabels.map(({ name, label, wide }) => (
          <div key={name} className={wide ? "sm:col-span-2" : ""}>
            <dt className="text-sm text-fg-muted">{label}</dt>
            <dd className="whitespace-pre-line">{texts[name] || "—"}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {documentFieldLabels.map(({ name, label, help, wide }) => (
        <div key={name} className={wide ? "sm:col-span-2" : ""}>
          <Field id={`${prefix}${name}`} label={label} help={help}>
            <Textarea
              name={`${prefix}${name}`}
              defaultValue={texts[name] ?? ""}
              rows={name === "intro" || name === "observations" ? 4 : 2}
              maxLength={4000}
            />
          </Field>
        </div>
      ))}
    </div>
  );
}
