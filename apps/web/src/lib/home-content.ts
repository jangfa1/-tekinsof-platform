// Fixed home-page copy. Everything here describes what Tekinsof does, never a claim about clients
// or results; authorised client stories, testimonial and logos live in home-cases.ts.
import type { IconName } from "./icons.ts";

// Service slug → icon; unknown slugs fall back per category.
const serviceIcons: Record<string, IconName> = {
  "desarrollo-de-software": "code-xml",
  "aplicaciones-web-a-medida": "globe",
  "aplicaciones-moviles": "smartphone",
  "integracion-erp": "layers",
  "integracion-crm": "users",
  "apis-empresariales": "plug",
  "automatizacion-de-procesos": "workflow",
  "microsoft-365": "layout-grid",
  "power-bi-y-analitica": "chart-column",
  "big-data": "database",
  "infraestructura-tecnologica": "server",
  azure: "cloud",
  aws: "cloud",
  ciberseguridad: "shield-check",
  "inteligencia-artificial-para-negocios": "brain-circuit",
  "marketing-digital": "megaphone",
  "branding-corporativo": "palette",
  "diseno-de-marca": "palette",
  seo: "search",
  "google-ads": "target",
  "facebook-ads": "target",
  "instagram-ads": "target",
  "tiktok-ads": "target",
  "linkedin-ads": "target",
  "automatizacion-de-marketing": "zap",
  "automatizacion-comercial": "funnel",
  "whatsapp-business": "message-circle",
  "chatbots-ia": "bot",
  "email-marketing": "mail",
  "growth-marketing": "trending-up",
  "generacion-de-leads": "rocket",
};

export function serviceIcon(slug: string, category: string): IconName {
  return serviceIcons[slug] ?? (category === "marketing" ? "megaphone" : "code-xml");
}

export const timeline: {
  step: string;
  title: string;
  text: string;
  icon: IconName;
  tags: string[];
}[] = [
  {
    step: "01",
    title: "Diagnóstico",
    text: "Entendemos tu operación, tus sistemas y dónde se pierde tiempo o dinero.",
    icon: "compass",
    tags: ["Procesos", "Sistemas actuales"],
  },
  {
    step: "02",
    title: "Integración",
    text: "Conectamos ERP, CRM y Microsoft 365 para que la información fluya sola.",
    icon: "git-merge",
    tags: ["ERP", "CRM", "APIs"],
  },
  {
    step: "03",
    title: "Datos",
    text: "Ordenamos tus datos y los convertimos en tableros que se entienden.",
    icon: "chart-column",
    tags: ["Power BI", "Big Data"],
  },
  {
    step: "04",
    title: "Automatización",
    text: "Eliminamos tareas manuales con flujos automáticos e inteligencia artificial.",
    icon: "workflow",
    tags: ["Procesos", "IA"],
  },
  {
    step: "05",
    title: "Crecimiento",
    text: "Atraemos prospectos con marketing digital medible y los atendemos rápido.",
    icon: "trending-up",
    tags: ["Ads", "SEO", "WhatsApp"],
  },
];

export const integrationFlow: { name: string; role: string; icon: IconName }[] = [
  { name: "ERP", role: "Ventas, inventario y finanzas", icon: "layers" },
  { name: "CRM", role: "Clientes y oportunidades", icon: "users" },
  { name: "Power BI", role: "Tableros en tiempo real", icon: "chart-column" },
  { name: "IA", role: "Clasifica, predice y sugiere", icon: "brain-circuit" },
  { name: "WhatsApp", role: "Atención y seguimiento", icon: "message-circle" },
];

export const automationPillars: { title: string; text: string; icon: IconName }[] = [
  {
    title: "Automatización de procesos",
    text: "Aprobaciones, reportes y registros que se hacen solos, sin hojas de cálculo.",
    icon: "workflow",
  },
  {
    title: "APIs empresariales",
    text: "Tus sistemas conversan entre sí con integraciones seguras y documentadas.",
    icon: "plug",
  },
  {
    title: "Inteligencia artificial",
    text: "Modelos que leen documentos, responden consultas y anticipan la demanda.",
    icon: "sparkles",
  },
];

export const funnel: { stage: string; text: string; channels: string[] }[] = [
  { stage: "Alcance", text: "Tu marca frente a quien la necesita.", channels: ["Branding", "SEO"] },
  {
    stage: "Prospectos",
    text: "Campañas que convierten visitas en leads.",
    channels: ["Google Ads", "Facebook Ads", "Instagram Ads", "TikTok Ads"],
  },
  {
    stage: "Conversación",
    text: "Respuesta inmediata por el canal preferido.",
    channels: ["WhatsApp Business"],
  },
  { stage: "Cliente", text: "Seguimiento hasta el cierre.", channels: ["Generación de leads"] },
];

// Only platforms already in the published catalog; no partner claims, no logos.
export const technologies = [
  "Microsoft 365",
  "Power BI",
  "Azure",
  "AWS",
  "Big Data",
  "APIs REST",
  "ERP",
  "CRM",
  "Inteligencia Artificial",
  "Google Ads",
  "Facebook Ads",
  "Instagram Ads",
  "TikTok Ads",
  "WhatsApp Business",
  "SEO",
];

export const benefits: { title: string; text: string }[] = [
  {
    title: "Un solo equipo",
    text: "Tecnología y marketing digital trabajando juntos, con un solo responsable de tu proyecto.",
  },
  {
    title: "Especialistas Microsoft",
    text: "Experiencia en Microsoft 365, Power BI y Azure aplicada a empresas.",
  },
  {
    title: "Respuesta en menos de 4 horas",
    text: "Cada consulta se asigna a un especialista y se atiende dentro del horario laboral.",
  },
  {
    title: "Resultados medibles",
    text: "Tableros y reportes para que veas el avance de cada proyecto y campaña.",
  },
];
