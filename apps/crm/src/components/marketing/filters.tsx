import { type PeriodPreset, periodPresets, presetLabels } from "@tekinsof/core/marketing/periods";
import Link from "next/link";
import { Button, Input, Select } from "@/components/ui";

export type Option = { value: string; label: string };

export type FilterValues = {
  desde: string;
  hasta: string;
  periodo?: PeriodPreset;
  campana?: string;
  plataforma?: string;
  origen?: string;
  vendedor?: string;
  landing?: string;
  grado?: string;
};

type Props = {
  values: FilterValues;
  options: Record<"campana" | "plataforma" | "origen" | "vendedor" | "landing" | "grado", Option[]>;
};

const selects: { name: keyof Props["options"]; label: string; all: string }[] = [
  { name: "campana", label: "Campaña", all: "Todas" },
  { name: "plataforma", label: "Plataforma", all: "Todas" },
  { name: "origen", label: "Origen", all: "Todos" },
  { name: "vendedor", label: "Vendedor", all: "Todos" },
  { name: "landing", label: "Landing", all: "Todas" },
  { name: "grado", label: "Calificación", all: "Todas" },
];

// Plain GET form: every filter lives in the URL, so a view can be bookmarked or shared. The
// period shortcuts keep the other filters.
export function Filters({ values, options }: Props) {
  const keep = Object.fromEntries(
    selects.flatMap(({ name }) => (values[name] ? [[name, values[name] as string]] : [])),
  );
  return (
    <div className="space-y-4">
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {periodPresets.map((preset) => {
          const active = values.periodo === preset;
          return (
            <Link
              key={preset}
              href={`/marketing?${new URLSearchParams({ ...keep, periodo: preset })}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "inline-flex min-h-9 items-center rounded-[var(--radius-control)] bg-primary px-3 text-sm font-medium text-primary-fg"
                  : "inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-medium hover:bg-surface"
              }
            >
              {presetLabels[preset]}
            </Link>
          );
        })}
      </nav>
      <form
        action="/marketing"
        aria-label="Filtros del dashboard"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <div>
          <label htmlFor="desde" className="block text-sm font-medium">
            Desde
          </label>
          <Input id="desde" name="desde" type="date" defaultValue={values.desde} />
        </div>
        <div>
          <label htmlFor="hasta" className="block text-sm font-medium">
            Hasta
          </label>
          <Input id="hasta" name="hasta" type="date" defaultValue={values.hasta} />
        </div>
        {selects.map((select) => (
          <div key={select.name}>
            <label htmlFor={select.name} className="block text-sm font-medium">
              {select.label}
            </label>
            <Select id={select.name} name={select.name} defaultValue={values[select.name] ?? ""}>
              <option value="">{select.all}</option>
              {options[select.name].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Aplicar filtros</Button>
          <Link
            href="/marketing"
            className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium text-fg-muted hover:text-fg"
          >
            Limpiar
          </Link>
        </div>
      </form>
    </div>
  );
}
