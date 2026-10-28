// Catalog of blueprint step 18, one service per line:
// code | name | slug | category | published (1/0) | featured (1/0) | summary
const table = `
SW-DEV|Desarrollo de Software|desarrollo-de-software|tecnologia|1|1|Sistemas a medida que se adaptan a la operación de tu empresa.
WEB-APP|Aplicaciones Web a Medida|aplicaciones-web-a-medida|tecnologia|1|1|Portales y aplicaciones web seguras, rápidas y fáciles de usar.
MOB-APP|Aplicaciones Móviles|aplicaciones-moviles|tecnologia|1|0|Apps para Android e iOS conectadas a tus sistemas.
ERP-INT|Integración ERP|integracion-erp|tecnologia|1|1|Conectamos tu ERP con ventas, logística y finanzas.
CRM-INT|Integración CRM|integracion-crm|tecnologia|1|1|Tu CRM sincronizado con el resto de la empresa.
API-ENT|APIs Empresariales|apis-empresariales|tecnologia|1|0|APIs documentadas para que tus sistemas hablen entre sí.
PROC-AUT|Automatización de Procesos|automatizacion-de-procesos|tecnologia|1|1|Menos tareas manuales y menos errores en tu operación.
M365|Microsoft 365|microsoft-365|tecnologia|1|1|Implementación, migración y adopción de Microsoft 365.
BI-PBI|Power BI y Analítica|power-bi-y-analitica|tecnologia|1|1|Tableros que muestran cómo va tu negocio hoy.
BIG-DATA|Big Data|big-data|tecnologia|1|1|Datos de muchas fuentes, ordenados y listos para decidir.
INFRA|Infraestructura Tecnológica|infraestructura-tecnologica|tecnologia|1|1|Redes, servidores y nube que no se caen.
AZURE|Azure|azure|tecnologia|1|0|Migración y operación de cargas de trabajo en Microsoft Azure.
AWS|AWS|aws|tecnologia|1|0|Arquitectura y operación de servicios en Amazon Web Services.
SEC|Ciberseguridad|ciberseguridad|tecnologia|1|1|Protegemos tus datos, cuentas y equipos.
AI-BIZ|Inteligencia Artificial aplicada a negocios|inteligencia-artificial-para-negocios|tecnologia|1|1|IA práctica para vender y operar mejor.
HELPDESK|Mesa de Ayuda|mesa-de-ayuda|tecnologia|0|0|Soporte técnico para tus usuarios con tiempos de respuesta acordados.
OUTSRC|Outsourcing TIC|outsourcing-tic|tecnologia|0|0|Profesionales de TI dedicados a tu empresa.
EQUIP|Equipamiento Tecnológico|equipamiento-tecnologico|tecnologia|0|0|Equipos de cómputo y redes con instalación y garantía.
LIC|Licenciamiento de Software|licenciamiento-de-software|tecnologia|0|0|Licencias originales de Microsoft y otros fabricantes.
MKT-DIG|Marketing Digital|marketing-digital|marketing|1|1|Estrategia y campañas en Google, Meta, LinkedIn y TikTok.
BRAND|Branding Corporativo|branding-corporativo|marketing|1|1|Una marca clara que inspira confianza.
BRAND-DES|Diseño de Marca|diseno-de-marca|marketing|1|0|Logotipo, identidad visual y manual de marca.
SEO|SEO|seo|marketing|1|0|Más visitas desde Google sin pagar por cada clic.
GADS|Google Ads|google-ads|marketing|1|0|Campañas de búsqueda y display que generan prospectos.
FBADS|Facebook Ads|facebook-ads|marketing|1|0|Anuncios en Facebook para llegar a tu público ideal.
IGADS|Instagram Ads|instagram-ads|marketing|1|0|Anuncios en Instagram que convierten seguidores en clientes.
TTADS|TikTok Ads|tiktok-ads|marketing|1|0|Campañas en TikTok para marcas que quieren crecer rápido.
LIADS|LinkedIn Ads|linkedin-ads|marketing|1|0|Anuncios B2B para llegar a quienes toman decisiones.
MKT-AUT|Automatización de Marketing|automatizacion-de-marketing|marketing|1|0|Flujos de correo y mensajes que nutren a tus prospectos.
COM-AUT|Automatización Comercial|automatizacion-comercial|marketing|1|1|Seguimiento de prospectos sin que se escape ninguno.
WA-BIZ|WhatsApp Business|whatsapp-business|marketing|1|1|Atiende y vende por el canal que tus clientes usan.
BOTS|Chatbots IA|chatbots-ia|marketing|1|0|Asistentes que responden a tus clientes a toda hora.
EMAIL|Email Marketing|email-marketing|marketing|1|0|Boletines y campañas de correo que se leen.
GROWTH|Growth Marketing|growth-marketing|marketing|1|0|Experimentos rápidos para crecer con datos.
LEADGEN|Generación de Leads|generacion-de-leads|marketing|1|0|Prospectos calificados para tu equipo comercial.
`;

export const serviceRows = table
  .trim()
  .split("\n")
  .map((line, i) => {
    const [code = "", name = "", slug = "", category = "", published, featured, summary = ""] =
      line.split("|");
    return {
      code,
      name,
      slug,
      category,
      summary,
      isPublished: published === "1",
      isFeatured: featured === "1",
      sortOrder: (i + 1) * 10,
    };
  });

const fixedHolidays: [string, string][] = [
  ["01-01", "Año Nuevo"],
  ["05-01", "Día del Trabajo"],
  ["06-07", "Batalla de Arica y Día de la Bandera"],
  ["06-29", "San Pedro y San Pablo"],
  ["07-23", "Día de la Fuerza Aérea del Perú"],
  ["07-28", "Fiestas Patrias"],
  ["07-29", "Fiestas Patrias"],
  ["08-06", "Batalla de Junín"],
  ["08-30", "Santa Rosa de Lima"],
  ["10-08", "Combate de Angamos"],
  ["11-01", "Todos los Santos"],
  ["12-08", "Inmaculada Concepción"],
  ["12-09", "Batalla de Ayacucho"],
  ["12-25", "Navidad"],
];

// Verified against the official calendar (gob.pe) before launch (blueprint §20.1).
export const holidayRows = [
  ...["2026", "2027"].flatMap((year) =>
    fixedHolidays.map(([day, name]) => ({ date: `${year}-${day}`, name })),
  ),
  { date: "2026-04-02", name: "Jueves Santo" },
  { date: "2026-04-03", name: "Viernes Santo" },
  { date: "2027-03-25", name: "Jueves Santo" },
  { date: "2027-03-26", name: "Viernes Santo" },
];

// Demo landing content (SEED_DEMO=1 only); validated by seed.ts with landingBlocksSchema.
export const demoBlocks = [
  {
    type: "hero",
    eyebrow: "Tekinsof Consulting",
    title: "Desarrollo de software a medida para tu empresa",
    subtitle:
      "Construimos el sistema que tu operación necesita, con un equipo que responde rápido.",
    ctaLabel: "Quiero una propuesta",
    ctaTarget: "form",
  },
  {
    type: "benefits",
    title: "Por qué elegirnos",
    items: [
      {
        title: "A tu medida",
        text: "Diseñamos el software alrededor de tus procesos, no al revés.",
      },
      { title: "Entregas cortas", text: "Ves avances funcionando cada dos semanas." },
      { title: "Soporte local", text: "Un equipo en Lima que conoce tu negocio." },
    ],
  },
  {
    type: "faq",
    title: "Preguntas frecuentes",
    items: [
      {
        question: "¿Cuánto demora un proyecto?",
        answer: "Un primer módulo suele estar listo en 6 a 10 semanas.",
      },
      {
        question: "¿Trabajan con mi ERP actual?",
        answer: "Sí, integramos el nuevo sistema con tus herramientas actuales.",
      },
    ],
  },
  {
    type: "form",
    title: "Cuéntanos tu proyecto",
    submitLabel: "Quiero que me contacten",
    fields: ["fullName", "email", "phone", "companyName", "message"],
    serviceInterest: "desarrollo-de-software",
  },
];
