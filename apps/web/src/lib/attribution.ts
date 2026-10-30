// Where the prospect came from, captured once per browser session, plus the conversion events the
// ad platforms use to optimize campaigns. Runs only in the browser (LeadForm island).

export type Attribution = {
  utm: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  referrer?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

const STORAGE_KEY = "tk_utm";

// First touch wins: the attribution of the visit that brought the prospect is kept for the session.
export function readAttribution(): Attribution {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Attribution;
    const query = new URLSearchParams(window.location.search);
    const pick = (key: string) => query.get(key) || undefined;
    const attribution: Attribution = {
      utm: {
        source: pick("utm_source"),
        medium: pick("utm_medium"),
        campaign: pick("utm_campaign"),
        term: pick("utm_term"),
        content: pick("utm_content"),
      },
      gclid: pick("gclid"),
      fbclid: pick("fbclid"),
      ttclid: pick("ttclid"),
      referrer: document.referrer || undefined,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return { utm: {} };
  }
}

function hasConsent(): boolean {
  try {
    return localStorage.getItem("tk_consent") === "granted";
  } catch {
    return false;
  }
}

// After a lead is accepted. Without consent nothing is sent; each platform only if its script is
// on the page (Base.astro loads them after consent and only when its ID is configured).
export function trackLeadConversion(): void {
  if (!hasConsent()) return;
  window.dataLayer?.push({ event: "lead_submitted" });
  window.gtag?.("event", "generate_lead");
  window.fbq?.("track", "Lead");
  window.ttq?.track("SubmitForm");
}
