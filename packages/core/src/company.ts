// Official Tekinsof contact data (blueprint §9.1). The single source for the public site, the
// e-mails sent to leads, the quote PDF and the seed: keep it identical everywhere (local SEO parity).
export const company = {
  legalName: "Tekinsof Consulting",
  email: "info@tekinsof.com",
  /** Display format; `phoneE164` for tel: links and schema.org, `whatsapp` for wa.me links. */
  phone: "+51 959 926 642",
  phoneE164: "+51959926642",
  whatsapp: "51959926642",
  streetAddress: "Av. Separadora Industrial Nro. 3144, Urb. Mayorazgo Etapa Tres",
  locality: "Lima",
  country: "Perú",
  address: "Av. Separadora Industrial Nro. 3144, Urb. Mayorazgo Etapa Tres, Lima, Perú",
  /** Same window as time/business-hours.ts (Monday–Friday 09:00–18:00, Lima). */
  hours: "Lunes a viernes, 9:00 a. m. a 6:00 p. m.",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Av.+Separadora+Industrial+3144%2C+Urb.+Mayorazgo%2C+Lima%2C+Per%C3%BA",
} as const;
