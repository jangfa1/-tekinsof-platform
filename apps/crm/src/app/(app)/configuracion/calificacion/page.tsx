import { listServices } from "@tekinsof/core/catalog/services";
import { getDb } from "@tekinsof/core/db/client";
import { getActiveModel, rescoreAll } from "@tekinsof/core/scoring/lead-scoring";
import {
  budgetRangeLabels,
  companySizeLabels,
  companyTypeLabels,
} from "@tekinsof/core/scoring/options";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gradeLabels } from "@/components/scoring/score-card";
import { Button, Card } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";

export const metadata: Metadata = { title: "Calificación de leads" };

const PATH = "/configuracion/calificacion";

const sourceLabels: Record<string, string> = {
  google_lead_form: "Formulario de Google",
  referral: "Referido",
  landing: "Landing",
  web_form: "Formulario web",
  event: "Evento",
  whatsapp: "WhatsApp",
  meta_lead_ads: "Formulario de Meta",
  manual: "Registro manual",
  tiktok_lead_ads: "Formulario de TikTok",
};

async function rescore() {
  "use server";
  const actor = await authorize("settings.manage");
  if (!actor.ok) redirect(`${PATH}?error=${encodeURIComponent(actor.error.message)}`);
  const result = await rescoreAll(getDb(), actor.data, new Date());
  if (!result.ok) redirect(`${PATH}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/leads");
  const ok = `Se recalificaron ${result.data.rescored} leads`;
  redirect(`${PATH}?ok=${encodeURIComponent(ok)}`);
}

type Row = { label: string; points: number };

// Highest points first, so the table reads as "what weighs most".
const sorted = (rows: Row[]) => [...rows].sort((a, b) => b.points - a.points);
const fromLabels = (points: Record<string, number>, labels: Record<string, string>) =>
  sorted(
    Object.entries(points).map(([value, n]) => ({ label: labels[value] ?? value, points: n })),
  );

function Signal({ title, max, rows }: { title: string; max: number; rows: Row[] }) {
  return (
    <section>
      <h3 className="font-display text-base font-semibold">
        {title} <span className="font-sans text-sm font-normal text-fg-muted">hasta {max} pts</span>
      </h3>
      <ul className="mt-2 divide-y divide-border text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex justify-between gap-4 py-1">
            <span>{row.label}</span>
            <span className="tabular-nums">{row.points}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ScoringSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermissionPage("settings.manage");
  const query = await searchParams;
  const db = getDb();
  const [model, services] = await Promise.all([getActiveModel(db), listServices(db)]);
  const { rules, thresholds } = model;
  const serviceNames = Object.fromEntries(services.map((s) => [s.slug, s.name]));
  const { interaction } = rules;
  const max = (rows: Row[]) => Math.max(0, ...rows.map((row) => row.points));

  const signals = [
    {
      title: "Servicio de interés",
      rows: [
        ...fromLabels(rules.service.bySlug, serviceNames),
        { label: "Cualquier otro servicio", points: rules.service.other },
      ],
    },
    { title: "Presupuesto", rows: fromLabels(rules.budget, budgetRangeLabels) },
    { title: "Tamaño de empresa", rows: fromLabels(rules.companySize, companySizeLabels) },
    {
      title: "Canal",
      rows: [
        ...fromLabels(rules.channel.bySource, sourceLabels),
        { label: "Otro canal", points: rules.channel.other },
      ],
    },
    { title: "Tipo de organización", rows: fromLabels(rules.companyType, companyTypeLabels) },
    {
      title: "Correo",
      rows: [
        { label: "Dominio corporativo", points: rules.email.corporate },
        { label: `Correo personal (${rules.email.freeDomains.length} dominios)`, points: 0 },
      ],
    },
    {
      title: "Interacción con el formulario",
      rows: sorted([
        {
          label: `Describe su necesidad (${interaction.minMessageLength}+ caracteres)`,
          points: interaction.message,
        },
        { label: "Deja correo y teléfono", points: interaction.bothContacts },
        { label: "Indica su empresa", points: interaction.company },
      ]),
    },
  ];
  // Interaction adds its parts; every other signal takes one value.
  const maxOf = (title: string, rows: Row[]) =>
    title.startsWith("Interacción") ? rows.reduce((sum, row) => sum + row.points, 0) : max(rows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Calificación de leads</h1>
        <p className="mt-2 max-w-[72ch] text-fg-muted">
          Cada lead recibe de 0 a 100 puntos y un grado. El grado solo ordena el trabajo y se usa
          para filtrar la bandeja: no cambia a quién se asigna el lead ni su plazo de atención.
        </p>
      </div>
      <div aria-live="polite">
        {query.ok ? (
          <p role="status" className="text-sm text-success">
            {query.ok}
          </p>
        ) : null}
        {query.error ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Grados">
          <dl className="space-y-2">
            {(["A", "B", "C"] as const).map((grade) => (
              <div key={grade} className="flex justify-between gap-4">
                <dt>{gradeLabels[grade]}</dt>
                <dd className="tabular-nums">desde {thresholds[grade]} pts</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt>{gradeLabels.D}</dt>
              <dd className="tabular-nums">menos de {thresholds.C} pts</dd>
            </div>
          </dl>
        </Card>
        <Card title="Recalificar">
          <p className="text-fg-muted">
            Vuelve a calcular el grado de todos los leads con las reglas de la versión{" "}
            {model.version}. Cada lead conserva su historial de calificaciones.
          </p>
          <form action={rescore} className="mt-4">
            <Button type="submit">Recalificar leads</Button>
          </form>
        </Card>
      </div>

      <Card title={`Reglas activas · versión ${model.version}`}>
        <div className="grid gap-6 md:grid-cols-2">
          {signals.map((signal) => (
            <Signal
              key={signal.title}
              title={signal.title}
              max={maxOf(signal.title, signal.rows)}
              rows={signal.rows}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
