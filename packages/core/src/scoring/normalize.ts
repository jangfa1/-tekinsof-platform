import {
  type BudgetRange,
  budgetRanges,
  type CompanySize,
  type CompanyType,
  companySizes,
  companyTypes,
} from "./options.ts";

// Ad form questions are free text chosen by Marketing on each platform ("¿Cuántos colaboradores
// tiene tu empresa?" → "51 a 200"). These helpers turn the answers into the CRM ranges; an answer
// they cannot read is left out (scored as "no indicado") rather than guessed.

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  (values as readonly string[]).includes(value);

// "10,000" and "10.000" are thousands; "5k" and "20 mil" multiply by 1000.
function amounts(text: string): number[] {
  const thousands = /\bmil\b|\d\s*k\b/.test(text);
  return [...text.matchAll(/\d+(?:[.,]\d{3})*/g)].map((match) => {
    const value = Number(match[0].replace(/[.,]/g, ""));
    return thousands && value < 1000 ? value * 1000 : value;
  });
}

const above = (text: string) => /\bmas de\b|\bmayor|\+|\bover\b|\bmore than\b/.test(text);
const below = (text: string) => /\bhasta\b|\bmenos de\b|\bmenor|\bup to\b|\bless than\b/.test(text);

export function normalizeCompanySize(answer: string): CompanySize | undefined {
  const text = plain(answer);
  if (isOneOf(companySizes, text)) return text;
  if (/\bmicro/.test(text)) return "1-10";
  if (/\bpeque/.test(text)) return "11-50";
  if (/\bmedian/.test(text)) return "51-200";
  if (/\bgrande|corporaci/.test(text)) return "201+";
  const numbers = amounts(text);
  if (numbers.length === 0) return undefined;
  // A range is placed by its upper end ("11-50" → 50); "más de 200" is past it.
  const top = (numbers[numbers.length - 1] ?? 0) + (above(text) ? 1 : 0);
  if (top <= 10) return "1-10";
  if (top <= 50) return "11-50";
  if (top <= 200) return "51-200";
  return "201+";
}

export function normalizeBudget(answer: string): BudgetRange | undefined {
  const text = plain(answer);
  if (isOneOf(budgetRanges, text)) return text;
  const [first] = amounts(text);
  if (first === undefined) return undefined;
  // A range is placed by its lower end ("20 mil a 50 mil" → 20000).
  const value = above(text) ? first + 1 : below(text) ? first - 1 : first;
  if (value < 5000) return "hasta-5k";
  if (value < 20000) return "5k-20k";
  if (value <= 50000) return "20k-50k";
  return "mas-50k";
}

export function normalizeCompanyType(answer: string): CompanyType | undefined {
  const text = plain(answer);
  if (isOneOf(companyTypes, text)) return text;
  if (/independiente|persona natural|freelance|emprendedor/.test(text)) return "independiente";
  if (/\bong\b|asociacion|fundacion|sin fines/.test(text)) return "ong";
  if (/public|estado|gobierno|municipal|ministerio/.test(text)) return "publica";
  if (/privad|\bs\.?a\.?c?\b|\bs\.?r\.?l\b|\beirl\b|empresa/.test(text)) return "privada";
  return undefined;
}

const questions = {
  companySize: /tamano|size|emplead|employee|colaborador|trabajador/,
  budget: /presupuesto|budget|inversion/,
  companyType: /tipo.*(empresa|organizacion|entidad)|company_type|organization_type|sector/,
};

export type Qualification = {
  companySize?: CompanySize;
  budgetRange?: BudgetRange;
  companyType?: CompanyType;
};

// Reads the qualification out of an ad form's unmapped answers (`leads.raw_answers`).
export function qualificationFromAnswers(answers: Record<string, string>): Qualification {
  const result: Qualification = {};
  for (const [question, answer] of Object.entries(answers)) {
    const key = plain(question);
    if (!result.companySize && questions.companySize.test(key)) {
      result.companySize = normalizeCompanySize(answer);
    } else if (!result.budgetRange && questions.budget.test(key)) {
      result.budgetRange = normalizeBudget(answer);
    } else if (!result.companyType && questions.companyType.test(key)) {
      result.companyType = normalizeCompanyType(answer);
    }
  }
  return result;
}
