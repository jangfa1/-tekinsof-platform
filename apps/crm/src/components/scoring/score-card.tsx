import { qualifierChoices } from "@tekinsof/core/scoring/options";
import type { ScoreReason } from "@tekinsof/core/scoring/rules";
import { Badge, Button, Card, Field, Select } from "@/components/ui";

const gradeTones = { A: "success", B: "neutral", C: "neutral", D: "warning" } as const;
export const gradeLabels: Record<string, string> = {
  A: "A · prioridad alta",
  B: "B · prioridad media",
  C: "C · prioridad baja",
  D: "D · prioridad mínima",
};

export function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <Badge>Sin calificar</Badge>;
  return (
    <Badge tone={gradeTones[grade as keyof typeof gradeTones] ?? "neutral"}>
      <span className="sr-only">Calificación </span>
      {grade}
    </Badge>
  );
}

const questions = [
  { name: "companySize", label: "Tamaño de la empresa", choices: qualifierChoices.companySize },
  { name: "budgetRange", label: "Presupuesto estimado", choices: qualifierChoices.budgetRange },
  { name: "companyType", label: "Tipo de organización", choices: qualifierChoices.companyType },
] as const;

type Props = {
  lead: {
    id: string;
    grade: string | null;
    score: number | null;
    companySize: string | null;
    budgetRange: string | null;
    companyType: string | null;
  };
  reasons: ScoreReason[];
  scoredAt: string | null;
  canEdit: boolean;
  action: (formData: FormData) => Promise<void>;
  errors: Record<string, string | undefined>;
};

// The grade with one line per signal, so the seller sees why and what to ask next. It is only
// shown and filtered on: it never changes the assignment or the SLA.
export function ScoreCard({ lead, reasons, scoredAt, canEdit, action, errors }: Props) {
  return (
    <Card title="Calificación">
      {lead.grade ? (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-3">
            <GradeBadge grade={lead.grade} />
            <span className="font-medium">{gradeLabels[lead.grade]}</span>
            <span className="tabular-nums text-fg-muted">{lead.score} de 100 puntos</span>
          </p>
          <ul className="divide-y divide-border">
            {reasons.map((reason) => (
              <li key={reason.signal} className="flex justify-between gap-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{reason.label}</span>
                  <span className="block text-fg-muted">{reason.detail}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {reason.points} / {reason.max}
                </span>
              </li>
            ))}
          </ul>
          {scoredAt ? <p className="text-sm text-fg-muted">Calificado el {scoredAt}</p> : null}
        </div>
      ) : (
        <p className="text-fg-muted">
          Este lead aún no tiene calificación. Completa los datos para calcularla.
        </p>
      )}

      {canEdit ? (
        <form action={action} className="mt-6 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="leadId" value={lead.id} />
          {questions.map((question) => (
            <Field
              key={question.name}
              id={question.name}
              label={question.label}
              error={errors[`e_${question.name}`]}
            >
              <Select name={question.name} defaultValue={lead[question.name] ?? ""}>
                <option value="">No indicado</option>
                {question.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          <div className="md:col-span-3">
            <Button type="submit">Guardar y recalificar</Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
