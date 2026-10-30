// Client stories, testimonial and logos for the home page. Every name, logo, quote and figure here is
// published with the client's authorisation (confirmed by Tekinsof, 2026-10-29): never add one that
// is not. Logos live in public/clientes/ (trimmed WebP exports of the files the clients provided).
import type { IconName } from "./icons.ts";

export type ClientLogo = { name: string; src: string; width: number; height: number };

const logos = {
  madrid: {
    name: "Madrid Ingenieros",
    src: "/clientes/madrid-ingenieros.webp",
    width: 197,
    height: 83,
  },
  wescon: { name: "Western Construction", src: "/clientes/wescon.webp", width: 421, height: 140 },
  cineplanet: { name: "Cineplanet", src: "/clientes/cineplanet.webp", width: 613, height: 142 },
  porta: {
    name: "Porta Construction",
    src: "/clientes/porta-construction.webp",
    width: 559,
    height: 196,
  },
} satisfies Record<string, ClientLogo>;

export type CaseStudy = {
  id: string;
  company: string;
  logo: ClientLogo;
  sector: string;
  title: string;
  icon: IconName;
  visual: "sync" | "pipeline" | "funnel";
  serviceSlug: string;
  /** The transformation in three beats: where they started, what Tekinsof built, what changed. */
  story: { stage: string; icon: IconName; text: string }[];
  results: string[];
  metric: { value: number; suffix: string; label: string };
};

export const caseStudies: CaseStudy[] = [
  {
    id: "madrid-ingenieros",
    company: "Madrid Ingenieros",
    logo: logos.madrid,
    sector: "Ingeniería",
    title: "Integración ERP + CRM",
    icon: "git-merge",
    visual: "sync",
    serviceSlug: "integracion-erp",
    story: [
      {
        stage: "El reto",
        icon: "layers",
        text: "Madrid Ingenieros enfrentaba procesos duplicados debido a que la información comercial era registrada manualmente en diferentes plataformas.",
      },
      {
        stage: "La solución",
        icon: "cable",
        text: "Tekinsof implementó una integración mediante Web Services entre el CRM y el ERP de la compañía, logrando sincronizar clientes, proyectos, órdenes y datos de facturación en tiempo real.",
      },
      {
        stage: "El impacto",
        icon: "trending-up",
        text: "Gracias a la integración se eliminó la duplicidad de registros, se redujeron errores operativos y se agilizó significativamente el proceso de facturación y control administrativo.",
      },
    ],
    results: [
      "Reducción de trabajo manual",
      "Eliminación de registros duplicados",
      "Integración de información comercial y financiera",
      "Mayor velocidad en el proceso de facturación",
      "Mejor trazabilidad de información",
    ],
    metric: { value: 70, suffix: "%", label: "menos tiempo en procesos administrativos" },
  },
  {
    id: "western-construction",
    company: "Western Construction",
    logo: logos.wescon,
    sector: "Construcción e inmobiliaria",
    title: "Automatización comercial",
    icon: "workflow",
    visual: "pipeline",
    serviceSlug: "automatizacion-comercial",
    story: [
      {
        stage: "El reto",
        icon: "users",
        text: "Western Construction necesitaba mejorar el seguimiento de oportunidades comerciales y centralizar la gestión de prospectos provenientes de distintos canales.",
      },
      {
        stage: "La solución",
        icon: "zap",
        text: "Tekinsof diseñó e implementó una plataforma de automatización comercial que integró formularios web, campañas digitales, gestión de prospectos y seguimiento automatizado de oportunidades.",
      },
      {
        stage: "El impacto",
        icon: "trending-up",
        text: "El proyecto permitió automatizar tareas repetitivas, mejorar la asignación de leads y brindar mayor visibilidad al equipo comercial sobre el estado de cada oportunidad.",
      },
    ],
    results: [
      "Centralización del proceso comercial",
      "Seguimiento automatizado de prospectos",
      "Reducción de tareas manuales",
      "Mejor control de oportunidades de negocio",
      "Mayor productividad del equipo comercial",
    ],
    metric: { value: 45, suffix: "%", label: "más seguimiento efectivo de oportunidades" },
  },
  {
    id: "cineplanet",
    company: "Cineplanet",
    logo: logos.cineplanet,
    sector: "Entretenimiento",
    title: "Campañas de generación de leads",
    icon: "rocket",
    visual: "funnel",
    serviceSlug: "generacion-de-leads",
    story: [
      {
        stage: "El reto",
        icon: "target",
        text: "Cineplanet requería optimizar la captación de potenciales clientes para campañas promocionales y programas de fidelización.",
      },
      {
        stage: "La solución",
        icon: "megaphone",
        text: "Tekinsof implementó una estrategia integral de marketing digital basada en landing pages, formularios inteligentes, automatización de seguimiento y análisis de conversiones.",
      },
      {
        stage: "El impacto",
        icon: "trending-up",
        text: "La solución permitió capturar información de usuarios interesados, segmentar audiencias y ejecutar campañas de manera más eficiente.",
      },
    ],
    results: [
      "Mayor captación de leads",
      "Segmentación inteligente de audiencias",
      "Mejor rendimiento de campañas digitales",
      "Mayor tasa de conversión",
      "Visibilidad completa del embudo comercial",
    ],
    metric: { value: 35, suffix: "%", label: "de incremento en captación de prospectos" },
  },
];

export const testimonial = {
  paragraphs: [
    "Antes de la intervención de Tekinsof, nuestra empresa contaba con licencias del ERP S10 que no estaban siendo aprovechadas adecuadamente. El equipo de Tekinsof realizó un levantamiento detallado de requerimientos, identificó oportunidades de mejora y desarrolló un plan de acompañamiento completamente personalizado.",
    "Gracias a su soporte especializado logramos implementar y utilizar correctamente los diferentes módulos del sistema, optimizando nuestros procesos internos, mejorando la calidad de la información y fortaleciendo nuestros controles operativos.",
    "Hoy contamos con información más confiable, procesos más organizados y un mejor aprovechamiento de la inversión realizada en nuestro ERP. El acompañamiento cercano y la capacidad de entender nuestro negocio marcaron una gran diferencia.",
  ],
  /** Shown large; it is the closing sentence of the quote, not a paraphrase. */
  highlight:
    "El acompañamiento cercano y la capacidad de entender nuestro negocio marcaron una gran diferencia.",
  name: "Carlos Pérez",
  role: "Jefe de Contabilidad",
  company: "Porta Construction",
  logo: logos.porta,
  tags: ["ERP S10", "Levantamiento de requerimientos", "Acompañamiento"],
};

// Client wall: the case-study and testimonial clients first, then the rest (authorised 2026-10-29).
const wall = (name: string, file: string, width: number, height: number): ClientLogo => ({
  name,
  src: `/clientes/${file}.webp`,
  width,
  height,
});

export const clientLogos: ClientLogo[] = [
  logos.madrid,
  logos.wescon,
  logos.cineplanet,
  logos.porta,
  wall("Alegra Inmobiliaria", "alegra-inmobiliaria", 268, 140),
  wall("Editora Perú", "editora-peru", 462, 107),
  wall("Euroshop", "euroshop", 225, 83),
  wall("Fondo MIVIVIENDA", "fondo-mivivienda", 345, 89),
  wall("Grupo Santamaria", "grupo-santamaria", 402, 140),
  wall("Livit Inmobiliaria & Construcción", "livit", 231, 140),
  wall("Universidad Tecnológica del Perú", "utp", 636, 140),
  wall("Vienna Grupo Inmobiliario", "vienna", 325, 95),
  wall("Vitain Inmobiliaria", "vitain-inmobiliaria", 263, 140),
  wall("Yape", "yape", 116, 140),
];
