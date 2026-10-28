import { z } from "zod";

// Landing block contract (blueprint §5). Validated when saving, when publishing and again in the
// site build, so the CRM preview and the published page always agree.
export const line = (max = 120) => z.string().trim().min(1, "Obligatorio").max(max);
const target = z.enum(["form", "whatsapp", "bookings"], "Destino inválido");
export const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Usa minúsculas y guiones");
export const formFields = [
  "fullName",
  "email",
  "phone",
  "companyName",
  "serviceInterest",
  "message",
] as const;

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hero"),
    eyebrow: z.preprocess((v) => (v === "" ? undefined : v), line(60).optional()),
    title: line(90),
    subtitle: line(220),
    ctaLabel: line(40),
    ctaTarget: target,
  }),
  z.object({
    type: z.literal("benefits"),
    title: line(),
    items: z
      .array(z.object({ title: line(80), text: line(240) }))
      .min(2, "Entre 2 y 6 ítems")
      .max(6, "Entre 2 y 6 ítems"),
  }),
  z.object({
    type: z.literal("logos"),
    title: line(),
    names: z.array(line(60)).min(1, "Entre 1 y 12 nombres").max(12, "Entre 1 y 12 nombres"),
  }),
  z.object({ type: z.literal("testimonial"), quote: line(400), author: line(80), role: line(80) }),
  z.object({
    type: z.literal("faq"),
    title: line(),
    items: z
      .array(z.object({ question: line(160), answer: line(600) }))
      .min(1, "Entre 1 y 10 preguntas")
      .max(10, "Entre 1 y 10 preguntas"),
  }),
  z.object({
    type: z.literal("cta"),
    title: line(90),
    text: line(220),
    ctaLabel: line(40),
    ctaTarget: target,
  }),
  z.object({
    type: z.literal("form"),
    title: line(90),
    submitLabel: line(40),
    fields: z
      .array(z.enum(formFields))
      .refine(
        (f) => f.includes("fullName") && f.includes("email"),
        "Nombre y correo son obligatorios",
      ),
    serviceInterest: z.preprocess((v) => (v === "" ? undefined : v), kebab.max(80).optional()),
  }),
]);

export type LandingBlock = z.infer<typeof blockSchema>;
export type BlockType = LandingBlock["type"];
export const blockTypes: BlockType[] = [
  "hero",
  "benefits",
  "logos",
  "testimonial",
  "faq",
  "cta",
  "form",
];

export const landingBlocksSchema = z
  .array(blockSchema)
  .min(1, "Agrega al menos un bloque")
  .max(20, "Máximo 20 bloques")
  .refine(
    (blocks) => blocks.filter((b) => b.type === "form").length <= 1,
    "Solo un formulario por landing",
  );

// Starting content for a newly added block; valid as is so the landing can be saved right away.
export function defaultBlock(type: BlockType): LandingBlock {
  switch (type) {
    case "hero":
      return {
        type,
        title: "Título de la landing",
        subtitle: "Una frase que explica la oferta.",
        ctaLabel: "Quiero información",
        ctaTarget: "form",
      };
    case "benefits":
      return {
        type,
        title: "Beneficios",
        items: [
          { title: "Beneficio 1", text: "Descripción breve." },
          { title: "Beneficio 2", text: "Descripción breve." },
        ],
      };
    case "logos":
      return { type, title: "Confían en nosotros", names: ["Cliente"] };
    case "testimonial":
      return {
        type,
        quote: "El testimonio del cliente.",
        author: "Nombre",
        role: "Cargo, Empresa",
      };
    case "faq":
      return {
        type,
        title: "Preguntas frecuentes",
        items: [{ question: "¿Pregunta?", answer: "Respuesta." }],
      };
    case "cta":
      return {
        type,
        title: "¿Conversamos?",
        text: "Escríbenos y te respondemos hoy.",
        ctaLabel: "Escríbenos por WhatsApp",
        ctaTarget: "whatsapp",
      };
    case "form":
      return {
        type,
        title: "Déjanos tus datos",
        submitLabel: "Quiero que me contacten",
        fields: ["fullName", "email", "phone", "companyName", "message"],
      };
  }
}
