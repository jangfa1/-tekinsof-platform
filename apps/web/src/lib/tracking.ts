// Ad and analytics tools the site can load after consent. Single list read by Base.astro (which
// tools to load) and the privacy page (which tools to disclose), so both always match. A new
// platform is one entry here plus its loader in Base.astro and its event in lib/attribution.ts.

export type TrackingProvider = {
  key: "ga4" | "meta" | "linkedin" | "tiktok";
  /** Build-time ID; empty means the tool is not loaded nor listed. */
  id: string;
  name: string;
  company: string;
  /** Hosts the browser contacts once the tool loads (for a future Content-Security-Policy). */
  hosts: string[];
  privacyUrl: string;
};

// PUBLIC_* values are read at build time; the site is fully static.
const providers: TrackingProvider[] = [
  {
    key: "ga4",
    id: process.env.PUBLIC_GA4_ID ?? "",
    name: "Google Analytics y Google Ads",
    company: "Google LLC",
    hosts: ["www.googletagmanager.com", "www.google-analytics.com", "googleads.g.doubleclick.net"],
    privacyUrl: "https://policies.google.com/privacy",
  },
  {
    key: "meta",
    id: process.env.PUBLIC_META_PIXEL_ID ?? "",
    name: "Píxel de Meta (Facebook e Instagram)",
    company: "Meta Platforms Ireland Ltd.",
    hosts: ["connect.facebook.net", "www.facebook.com"],
    privacyUrl: "https://www.facebook.com/privacy/policy",
  },
  {
    key: "linkedin",
    id: process.env.PUBLIC_LINKEDIN_PARTNER_ID ?? "",
    name: "LinkedIn Insight Tag",
    company: "LinkedIn Ireland Unlimited Company",
    hosts: ["snap.licdn.com", "px.ads.linkedin.com"],
    privacyUrl: "https://www.linkedin.com/legal/privacy-policy",
  },
  {
    key: "tiktok",
    id: process.env.PUBLIC_TIKTOK_PIXEL_ID ?? "",
    name: "Píxel de TikTok",
    company: "TikTok Technology Limited",
    hosts: ["analytics.tiktok.com"],
    privacyUrl: "https://www.tiktok.com/legal/page/row/privacy-policy/es",
  },
];

export const activeTrackers = providers.filter((provider) => provider.id);

export const trackerId = (key: TrackingProvider["key"]) =>
  providers.find((provider) => provider.key === key)?.id ?? "";
