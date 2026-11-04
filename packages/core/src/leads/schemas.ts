import { z } from "zod";
import { budgetRanges, companySizes, companyTypes } from "../scoring/options.ts";

// Input schemas and enumerations of the leads domain, shared by leads.ts and the CRM.

export const leadStatuses = [
  "nuevo",
  "contactado",
  "calificado",
  "descartado",
  "convertido",
] as const;
export const manualSources = ["whatsapp", "referral", "manual", "event", "other"] as const;
export type LeadStatus = (typeof leadStatuses)[number];

// Empty strings and nulls from forms mean "not provided".
export const blank = (value: unknown) => (value === "" || value === null ? undefined : value);
export const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());
const kebab = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Formato inválido");
export const text = (max: number) => z.string().trim().max(max);
const phone = z
  .string()
  .trim()
  .min(6, "Teléfono inválido")
  .max(20, "Teléfono inválido")
  .regex(/^[0-9+ ()-]+$/, "Teléfono inválido");
const reachable = (lead: { email?: string; phone?: string }) => Boolean(lead.email || lead.phone);
const reachMessage = { message: "Indica un correo o un teléfono", path: ["email"] };

// Optional answers used by lead scoring (scoring/options.ts).
const qualification = {
  companySize: opt(z.enum(companySizes, "Tamaño inválido")),
  budgetRange: opt(z.enum(budgetRanges, "Presupuesto inválido")),
  companyType: opt(z.enum(companyTypes, "Tipo inválido")),
};

// Blueprint §5, POST /api/public/leads.
export const publicLeadInput = z
  .object({
    fullName: z.string().trim().min(2, "Indica tu nombre").max(120),
    email: opt(z.email("Correo inválido").trim().toLowerCase()),
    phone: opt(phone),
    companyName: opt(text(160)),
    serviceInterest: opt(kebab),
    message: opt(text(2000)),
    ...qualification,
    consent: z.literal(true, "Debes aceptar la política de privacidad"),
    consentVersion: z.string().trim().min(1),
    landingSlug: opt(kebab),
    campaignSlug: opt(kebab),
    utm: opt(
      z.object({
        source: opt(text(200)),
        medium: opt(text(200)),
        campaign: opt(text(200)),
        term: opt(text(200)),
        content: opt(text(200)),
      }),
    ),
    gclid: opt(text(500)),
    fbclid: opt(text(500)),
    ttclid: opt(text(500)),
    referrer: opt(text(500)),
    turnstileToken: z.string().min(1, "Verificación requerida"),
    website: z.string().optional(),
  })
  .refine(reachable, reachMessage);

export const manualLeadInput = z
  .object({
    fullName: z.string().trim().min(2, "Indica el nombre").max(120),
    email: opt(z.email("Correo inválido").trim().toLowerCase()),
    phone: opt(phone),
    companyName: opt(text(160)),
    serviceInterest: opt(kebab),
    message: opt(text(2000)),
    ...qualification,
    source: z.preprocess(blank, z.enum(manualSources).default("whatsapp")),
  })
  .refine(reachable, reachMessage);
