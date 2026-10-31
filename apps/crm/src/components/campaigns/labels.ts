import { formatAmount } from "@tekinsof/core/sales/quote-math";

export const CAMPAIGNS_PATH = "/campanas";

export const channelLabels: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  linkedin_ads: "LinkedIn Ads",
  tiktok_ads: "TikTok Ads",
  seo: "SEO",
  email: "Email",
  whatsapp: "WhatsApp",
  referral: "Referidos",
  event: "Evento",
  other: "Otro",
};

export const platformLabels: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  tiktok: "TikTok",
  otra: "Otra",
};

export const money = (cents: number, currency: string) =>
  `${currency === "USD" ? "US$" : "S/"} ${formatAmount(cents)}`;

// "2026-10-30" (a Lima calendar day) → "30 oct 2026" without shifting it through UTC.
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", dateStyle: "medium" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
