---
paths:
  - "apps/web/**"
---

# Public site

- Output is fully static (`output: "static"`); no server endpoints, no adapter. Data comes from `src/lib/content.ts` at build time.
- The only interactive island is `LeadForm.tsx` (`client:visible`); everything else ships zero JS (the consent banner and the WhatsApp link use small inline scripts).
- Every page uses `layouts/Base.astro` with a unique title, description and canonical; landings under `/lp/` are `noindex` and excluded from the sitemap.
- Same tokens as the CRM (light only); `accent` buttons carry `text-accent-fg` (never white text on coral).
- Fonts are self-hosted through Fontsource; never link Google Fonts.
- Ad pixels load only after `localStorage.tk_consent === "granted"`.
- Contact data is fixed: Av. Separadora Industrial Nro. 3144, Urb. Mayorazgo Etapa Tres, Lima, Perú · info@tekinsof.com · +51 959 926 642 (WhatsApp) · lunes a viernes 9:00–18:00 — single source `packages/core/src/company.ts`; keep it identical everywhere (SEO parity, blueprint §9.1).
