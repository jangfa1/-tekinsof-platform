import { z } from "zod";
import { budgetRanges, companySizes, companyTypes } from "./options.ts";

// A scoring model is versioned data (scoring_models.rules / thresholds), not code: Gerencia can
// publish a new version without a deploy. Every signal's points are explicit; the maximum of a
// signal is its highest value, and the default model adds up to 100.

const points = z.number().int().min(0).max(100);
const pointsBy = <T extends readonly [string, ...string[]]>(values: T) =>
  z.object(
    Object.fromEntries(values.map((value) => [value, points])) as Record<T[number], typeof points>,
  );

export const scoringRules = z.object({
  service: z.object({ bySlug: z.record(z.string(), points), other: points }),
  budget: pointsBy(budgetRanges),
  companySize: pointsBy(companySizes),
  channel: z.object({ bySource: z.record(z.string(), points), other: points }),
  companyType: pointsBy(companyTypes),
  email: z.object({ corporate: points, freeDomains: z.array(z.string()) }),
  interaction: z.object({
    message: points,
    minMessageLength: z.number().int().min(1),
    bothContacts: points,
    company: points,
  }),
});

export const scoringThresholds = z
  .object({ A: points, B: points, C: points })
  .refine((t) => t.A > t.B && t.B > t.C, "Los umbrales deben ir de mayor a menor: A > B > C");

export type ScoringRules = z.infer<typeof scoringRules>;
export type ScoringThresholds = z.infer<typeof scoringThresholds>;
export type ScoringModel = { version: number; rules: ScoringRules; thresholds: ScoringThresholds };

// Version 1 (approved 2026-10-30): service 20, budget 20, company size 15, channel 15, company
// type 10, corporate email 10, form interaction 10.
export const defaultScoringModel: ScoringModel = {
  version: 1,
  rules: {
    service: {
      bySlug: {
        "integracion-erp": 20,
        "integracion-crm": 20,
        "desarrollo-de-software": 20,
        "aplicaciones-web-a-medida": 20,
        "automatizacion-de-procesos": 20,
        "apis-empresariales": 20,
        "big-data": 20,
        "power-bi-y-analitica": 20,
        "inteligencia-artificial-para-negocios": 20,
        "aplicaciones-moviles": 15,
        "microsoft-365": 15,
        azure: 15,
        aws: 15,
        "infraestructura-tecnologica": 15,
        ciberseguridad: 15,
        "outsourcing-tic": 15,
        "marketing-digital": 15,
        "mesa-de-ayuda": 8,
        "licenciamiento-de-software": 8,
        "equipamiento-tecnologico": 8,
      },
      other: 12,
    },
    budget: { "hasta-5k": 5, "5k-20k": 10, "20k-50k": 15, "mas-50k": 20 },
    companySize: { "1-10": 4, "11-50": 8, "51-200": 12, "201+": 15 },
    channel: {
      bySource: {
        google_lead_form: 15,
        referral: 15,
        landing: 12,
        web_form: 12,
        event: 10,
        whatsapp: 10,
        meta_lead_ads: 8,
        manual: 8,
        tiktok_lead_ads: 6,
      },
      other: 5,
    },
    companyType: { privada: 10, publica: 8, ong: 5, independiente: 2 },
    email: {
      corporate: 10,
      freeDomains: [
        "gmail.com",
        "googlemail.com",
        "hotmail.com",
        "hotmail.es",
        "outlook.com",
        "outlook.es",
        "live.com",
        "msn.com",
        "yahoo.com",
        "yahoo.es",
        "icloud.com",
        "protonmail.com",
        "proton.me",
      ],
    },
    interaction: { message: 5, minMessageLength: 40, bothContacts: 3, company: 2 },
  },
  thresholds: { A: 75, B: 50, C: 25 },
};
