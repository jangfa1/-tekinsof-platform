import type { ScoringModel } from "./model.ts";
import {
  type BudgetRange,
  budgetRangeLabels,
  type CompanySize,
  type CompanyType,
  companySizeLabels,
  companyTypeLabels,
  type Grade,
} from "./options.ts";

// Pure rule-based scoring: same input and model, same result. Missing data scores 0 and the
// reason says so ("no indicado"), so a seller sees what to ask instead of a bare number.

export type ScoringInput = {
  source: string;
  serviceInterest?: string | null;
  budgetRange?: BudgetRange | null;
  companySize?: CompanySize | null;
  companyType?: CompanyType | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  message?: string | null;
};

export type ScoreSignal =
  | "service"
  | "budget"
  | "companySize"
  | "channel"
  | "companyType"
  | "email"
  | "interaction";

export type ScoreReason = {
  signal: ScoreSignal;
  label: string;
  points: number;
  max: number;
  detail: string;
};

export type ScoreResult = { score: number; grade: Grade; reasons: ScoreReason[] };

const maxOf = (values: Record<string, number>, extra = 0) =>
  Math.max(extra, ...Object.values(values));

const sourceLabels: Record<string, string> = {
  web_form: "Formulario web",
  landing: "Landing",
  whatsapp: "WhatsApp",
  referral: "Referido",
  manual: "Registro manual",
  event: "Evento",
  meta_lead_ads: "Formulario de Meta",
  tiktok_lead_ads: "Formulario de TikTok",
  google_lead_form: "Formulario de Google",
};

function lookup<K extends string>(
  table: Record<K, number>,
  value: K | null | undefined,
  label: string,
  describe: (value: K) => string,
) {
  const max = maxOf(table);
  if (!value) return { points: 0, max, detail: `${label}: no indicado` };
  return { points: table[value] ?? 0, max, detail: describe(value) };
}

export function gradeFor(score: number, thresholds: ScoringModel["thresholds"]): Grade {
  if (score >= thresholds.A) return "A";
  if (score >= thresholds.B) return "B";
  if (score >= thresholds.C) return "C";
  return "D";
}

export function scoreLead(input: ScoringInput, model: ScoringModel): ScoreResult {
  const { rules } = model;
  const reasons: ScoreReason[] = [];
  const add = (signal: ScoreSignal, label: string, part: Omit<ScoreReason, "signal" | "label">) =>
    reasons.push({ signal, label, ...part });

  const serviceMax = maxOf(rules.service.bySlug, rules.service.other);
  add(
    "service",
    "Servicio",
    input.serviceInterest
      ? {
          points: rules.service.bySlug[input.serviceInterest] ?? rules.service.other,
          max: serviceMax,
          detail: `Servicio: ${input.serviceInterest}`,
        }
      : { points: 0, max: serviceMax, detail: "Servicio: no indicado" },
  );
  add(
    "budget",
    "Presupuesto",
    lookup(rules.budget, input.budgetRange, "Presupuesto", (v) => budgetRangeLabels[v]),
  );
  add(
    "companySize",
    "Tamaño de empresa",
    lookup(rules.companySize, input.companySize, "Tamaño", (v) => companySizeLabels[v]),
  );
  add("channel", "Canal", {
    points: rules.channel.bySource[input.source] ?? rules.channel.other,
    max: maxOf(rules.channel.bySource, rules.channel.other),
    detail: `Canal: ${sourceLabels[input.source] ?? input.source}`,
  });
  add(
    "companyType",
    "Tipo de empresa",
    lookup(rules.companyType, input.companyType, "Tipo de empresa", (v) => companyTypeLabels[v]),
  );

  const domain = input.email?.split("@")[1]?.toLowerCase();
  const personal = domain ? rules.email.freeDomains.includes(domain) : false;
  add("email", "Correo", {
    points: domain && !personal ? rules.email.corporate : 0,
    max: rules.email.corporate,
    detail: !domain
      ? "Correo: no indicado"
      : personal
        ? `Correo personal (${domain})`
        : `Correo corporativo (${domain})`,
  });

  const { interaction } = rules;
  const parts: string[] = [];
  let interactionPoints = 0;
  if ((input.message?.trim().length ?? 0) >= interaction.minMessageLength) {
    interactionPoints += interaction.message;
    parts.push("describió su necesidad");
  }
  if (input.email && input.phone) {
    interactionPoints += interaction.bothContacts;
    parts.push("dejó correo y teléfono");
  }
  if (input.companyName) {
    interactionPoints += interaction.company;
    parts.push("indicó su empresa");
  }
  add("interaction", "Interacción", {
    points: interactionPoints,
    max: interaction.message + interaction.bothContacts + interaction.company,
    detail: parts.length ? `Interacción: ${parts.join(", ")}` : "Interacción: solo datos mínimos",
  });

  const total = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const score = Math.min(100, Math.max(0, total));
  return { score, grade: gradeFor(score, model.thresholds), reasons };
}
