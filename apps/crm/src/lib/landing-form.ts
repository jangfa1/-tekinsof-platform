import type { BlockType } from "@tekinsof/core/cms/block-schema";

// Landing editor: block fields as HTML form controls and back. Validation lives in core.
type Kind = "text" | "textarea" | "target" | "lines" | "fields";
export type FieldDef = { name: string; label: string; kind: Kind; help?: string };

export const typeLabels: Record<BlockType, string> = {
  hero: "Portada (hero)",
  benefits: "Beneficios",
  logos: "Logos de clientes",
  testimonial: "Testimonio",
  faq: "Preguntas frecuentes",
  cta: "Llamado a la acción",
  form: "Formulario",
};
const pairHelp = "Uno por línea: título | texto";
export const fieldsByType: Record<BlockType, FieldDef[]> = {
  hero: [
    { name: "eyebrow", label: "Antetítulo (opcional)", kind: "text" },
    { name: "title", label: "Título", kind: "text", help: "Máximo 90 caracteres" },
    { name: "subtitle", label: "Subtítulo", kind: "textarea" },
    { name: "ctaLabel", label: "Texto del botón", kind: "text" },
    { name: "ctaTarget", label: "Destino del botón", kind: "target" },
  ],
  benefits: [
    { name: "title", label: "Título", kind: "text" },
    { name: "items", label: "Beneficios", kind: "lines", help: pairHelp },
  ],
  logos: [
    { name: "title", label: "Título", kind: "text" },
    { name: "names", label: "Clientes", kind: "lines", help: "Un nombre por línea" },
  ],
  testimonial: [
    { name: "quote", label: "Testimonio", kind: "textarea" },
    { name: "author", label: "Autor", kind: "text" },
    { name: "role", label: "Cargo y empresa", kind: "text" },
  ],
  faq: [
    { name: "title", label: "Título", kind: "text" },
    {
      name: "items",
      label: "Preguntas",
      kind: "lines",
      help: "Una por línea: pregunta | respuesta",
    },
  ],
  cta: [
    { name: "title", label: "Título", kind: "text" },
    { name: "text", label: "Texto", kind: "textarea" },
    { name: "ctaLabel", label: "Texto del botón", kind: "text" },
    { name: "ctaTarget", label: "Destino del botón", kind: "target" },
  ],
  form: [
    { name: "title", label: "Título", kind: "text" },
    { name: "submitLabel", label: "Texto del botón", kind: "text" },
    { name: "fields", label: "Campos", kind: "fields" },
    { name: "serviceInterest", label: "Servicio (slug, opcional)", kind: "text" },
  ],
};
export const fieldLabels: Record<string, string> = {
  fullName: "Nombre",
  email: "Correo",
  phone: "Teléfono",
  companyName: "Empresa",
  serviceInterest: "Servicio",
  message: "Mensaje",
};
const pairKeys: Partial<Record<BlockType, [string, string]>> = {
  benefits: ["title", "text"],
  faq: ["question", "answer"],
};

export type Raw = Record<string, unknown>;
export const str = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

// Form fields → block object. Validation happens in saveLanding (core).
export function readBlock(formData: FormData, i: number): Raw {
  const type = str(formData, `blocks.${i}.type`) as BlockType;
  const block: Raw = { type };
  for (const def of fieldsByType[type] ?? []) {
    const key = `blocks.${i}.${def.name}`;
    if (def.kind === "fields") block[def.name] = formData.getAll(key).map(String);
    else if (def.kind === "lines") {
      const lines = str(formData, key)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const keys = pairKeys[type];
      block[def.name] = keys
        ? lines.map((l) => {
            const [a = "", ...rest] = l.split("|");
            return { [keys[0]]: a.trim(), [keys[1]]: rest.join("|").trim() };
          })
        : lines;
    } else block[def.name] = str(formData, key);
  }
  return block;
}

export function display(block: Raw, def: FieldDef): string {
  const value = block[def.name];
  if (def.kind !== "lines" || !Array.isArray(value)) return typeof value === "string" ? value : "";
  const keys = pairKeys[block.type as BlockType];
  return value
    .map((v) => (keys ? `${(v as Raw)[keys[0]]} | ${(v as Raw)[keys[1]]}` : String(v)))
    .join("\n");
}
