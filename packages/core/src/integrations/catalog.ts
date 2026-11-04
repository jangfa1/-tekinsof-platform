import type { InboundProvider } from "../capture/inbound.ts";

// Every connector the CRM shows, active or announced. It is code, not a table: an upcoming entry
// has no backend, and making it active means adding its provider to `inbound_events` /
// `integration_accounts` (blueprint R2 §1 leaves `whatsapp` ready for that) plus an adapter.
// Copy stays organization-neutral so the same screen serves other companies later (SaaS phase).

export type IntegrationId =
  | "facebook"
  | "instagram"
  | "google"
  | "tiktok"
  | "whatsapp"
  | "linkedin"
  | "microsoft_forms"
  | "calendly"
  | "microsoft_bookings";

export type AdPlatform = "facebook" | "instagram" | "google" | "tiktok";

/** How an active integration is set up: a Meta Page token, a per-form Google key, a signed webhook. */
export type ConnectionKind = "meta_page" | "google_form" | "signed_webhook";

type Base = {
  id: IntegrationId;
  name: string;
  category: string;
  description: string;
  monogram: string;
};

export type ActiveIntegration = Base & {
  availability: "activa";
  provider: InboundProvider;
  adPlatform: AdPlatform;
  connection: ConnectionKind;
  note?: string;
};
export type UpcomingIntegration = Base & { availability: "proximamente" };
export type CatalogEntry = ActiveIntegration | UpcomingIntegration;

export const activeIntegrations: ActiveIntegration[] = [
  {
    id: "facebook",
    name: "Facebook Lead Ads",
    category: "Anuncios",
    description: "Recibe al instante los leads de tus formularios instantáneos de Facebook.",
    monogram: "f",
    availability: "activa",
    provider: "meta",
    adPlatform: "facebook",
    connection: "meta_page",
  },
  {
    id: "instagram",
    name: "Instagram Lead Ads",
    category: "Anuncios",
    description: "Los formularios de tus anuncios de Instagram llegan al CRM con su campaña.",
    monogram: "IG",
    availability: "activa",
    provider: "meta",
    adPlatform: "instagram",
    connection: "meta_page",
    note: "Se conecta con tu Página de Facebook.",
  },
  {
    id: "google",
    name: "Google Lead Forms",
    category: "Anuncios",
    description: "Formularios de clientes potenciales de Google Ads con un webhook por formulario.",
    monogram: "G",
    availability: "activa",
    provider: "google_ads",
    adPlatform: "google",
    connection: "google_form",
  },
  {
    id: "tiktok",
    name: "TikTok Lead Ads",
    category: "Anuncios",
    description: "Leads de TikTok mediante un webhook firmado, directo o por un conector.",
    monogram: "TT",
    availability: "activa",
    provider: "tiktok",
    adPlatform: "tiktok",
    connection: "signed_webhook",
  },
];

export const upcomingIntegrations: UpcomingIntegration[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business Cloud API",
    category: "Mensajería",
    description: "Conversaciones de WhatsApp registradas en el lead y su historial.",
    monogram: "WA",
    availability: "proximamente",
  },
  {
    id: "linkedin",
    name: "LinkedIn Lead Gen Forms",
    category: "Anuncios",
    description: "Leads B2B de tus campañas de LinkedIn con su empresa y cargo.",
    monogram: "in",
    availability: "proximamente",
  },
  {
    id: "microsoft_forms",
    name: "Microsoft Forms",
    category: "Formularios",
    description: "Respuestas de tus formularios de Microsoft 365 convertidas en leads.",
    monogram: "MF",
    availability: "proximamente",
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "Agenda",
    description: "Reuniones agendadas registradas como actividades del lead.",
    monogram: "Ca",
    availability: "proximamente",
  },
  {
    id: "microsoft_bookings",
    name: "Microsoft Bookings",
    category: "Agenda",
    description: "Citas de Bookings sincronizadas con el seguimiento comercial.",
    monogram: "MB",
    availability: "proximamente",
  },
];

export function findActiveIntegration(id: string): ActiveIntegration | undefined {
  return activeIntegrations.find((entry) => entry.id === id);
}
