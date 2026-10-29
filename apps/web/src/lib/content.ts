// Build-time reads of the CRM database (the site never writes to it). DATABASE_URL comes from the
// repository-root .env loaded by astro.config.mjs.
import { listServices, type Service } from "@tekinsof/core/catalog/services";
import {
  type LandingBlock,
  landingBlocksSchema,
  listPublishedLandings,
} from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";

// PUBLIC_* values shared by every page that renders the lead form or WhatsApp links.
export const site = {
  apiUrl: process.env.PUBLIC_LEADS_API_URL || "http://localhost:3000/api/public/leads",
  siteKey: process.env.PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
  whatsappNumber: process.env.PUBLIC_WHATSAPP_NUMBER || "51981053022",
  bookingsUrl: process.env.PUBLIC_BOOKINGS_URL || "#contacto",
  consentVersion: "2026-10",
};

export const whatsappLink = (text: string) =>
  `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(text)}`;

export type ServiceGroup = { title: string; services: Service[] };

const categoryTitles: Record<string, string> = {
  tecnologia: "Tecnología",
  marketing: "Marketing digital",
};

// Every page (and the shared header and footer) reads the catalog; query it once per build.
let published: Promise<Service[]> | undefined;

export function getPublishedServices(): Promise<Service[]> {
  published ??= listServices(getDb(), { activeOnly: true, publishedOnly: true });
  return published;
}

export async function getFeaturedServices(): Promise<ServiceGroup[]> {
  const featured = (await getPublishedServices()).filter((s) => s.isFeatured);
  return Object.entries(categoryTitles)
    .map(([category, title]) => ({
      title,
      services: featured.filter((s) => s.category === category),
    }))
    .filter((group) => group.services.length > 0);
}

export type PublishedLanding = Omit<
  Awaited<ReturnType<typeof listPublishedLandings>>[number],
  "blocks"
> & { blocks: LandingBlock[] };

// An invalid landing fails the build, naming its slug, instead of shipping a broken page.
export async function getPublishedLandings(): Promise<PublishedLanding[]> {
  const rows = await listPublishedLandings(getDb());
  return rows.map((row) => {
    const blocks = landingBlocksSchema.safeParse(row.blocks);
    if (!blocks.success) {
      throw new Error(`Landing "${row.slug}" has invalid blocks: ${blocks.error.message}`);
    }
    return { ...row, blocks: blocks.data };
  });
}
