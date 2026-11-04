// Qualification answers a lead can give (web form, CRM or normalized ad form answers). The values
// match the `ck_leads_*` checks in schema.ts; the labels are what forms and the CRM show.

export const companySizes = ["1-10", "11-50", "51-200", "201+"] as const;
export const budgetRanges = ["hasta-5k", "5k-20k", "20k-50k", "mas-50k"] as const;
export const companyTypes = ["privada", "publica", "ong", "independiente"] as const;
export const grades = ["A", "B", "C", "D"] as const;

export type CompanySize = (typeof companySizes)[number];
export type BudgetRange = (typeof budgetRanges)[number];
export type CompanyType = (typeof companyTypes)[number];
export type Grade = (typeof grades)[number];

export const companySizeLabels: Record<CompanySize, string> = {
  "1-10": "1 a 10 colaboradores",
  "11-50": "11 a 50 colaboradores",
  "51-200": "51 a 200 colaboradores",
  "201+": "Más de 200 colaboradores",
};

export const budgetRangeLabels: Record<BudgetRange, string> = {
  "hasta-5k": "Hasta S/ 5,000",
  "5k-20k": "S/ 5,000 a S/ 20,000",
  "20k-50k": "S/ 20,000 a S/ 50,000",
  "mas-50k": "Más de S/ 50,000",
};

export const companyTypeLabels: Record<CompanyType, string> = {
  privada: "Empresa privada",
  publica: "Entidad pública",
  ong: "ONG o asociación",
  independiente: "Independiente o persona natural",
};

const toChoices = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

// Select options for the site form (passed from Astro frontmatter) and the CRM.
export const qualifierChoices = {
  companySize: toChoices(companySizes, companySizeLabels),
  budgetRange: toChoices(budgetRanges, budgetRangeLabels),
  companyType: toChoices(companyTypes, companyTypeLabels),
};
