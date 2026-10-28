import type { LandingBlock } from "./block-schema.ts";

// One renderer for the CRM preview and the static site, so what Marketing sees is what ships.
// Token classes only (blueprint §7). CTAs are plain links: the site swaps `data-cta` targets for its
// WhatsApp and Bookings URLs.

const fieldLabels: Record<string, string> = {
  fullName: "Nombre y apellido",
  email: "Correo",
  phone: "Teléfono / WhatsApp",
  companyName: "Empresa",
  serviceInterest: "Servicio de interés",
  message: "¿En qué te ayudamos?",
};

const ctaClass =
  "inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-accent px-6 font-medium text-accent-fg";

function Cta({ label, target }: { label: string; target: "form" | "whatsapp" | "bookings" }) {
  if (target === "form") {
    return (
      <a href="#formulario" className={ctaClass}>
        {label}
      </a>
    );
  }
  return (
    <a href="#formulario" data-cta={target} className={ctaClass}>
      {label}
    </a>
  );
}

const section = "mx-auto max-w-[1200px] px-4 py-16";

export function Block({ block, preview = false }: { block: LandingBlock; preview?: boolean }) {
  switch (block.type) {
    case "hero":
      return (
        <section className="bg-surface-accent">
          <div className={section}>
            {block.eyebrow ? <p className="font-medium text-link">{block.eyebrow}</p> : null}
            <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold tracking-tight">
              {block.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-fg-muted">{block.subtitle}</p>
            <div className="mt-8">
              <Cta label={block.ctaLabel} target={block.ctaTarget} />
            </div>
          </div>
        </section>
      );
    case "benefits":
      return (
        <section className={section}>
          <h2 className="font-display text-3xl font-bold tracking-tight">{block.title}</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {block.items.map((item) => (
              <li
                key={item.title}
                className="rounded-[var(--radius-card)] border border-border p-6"
              >
                <p className="font-display text-lg font-semibold">{item.title}</p>
                <p className="mt-2 text-fg-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    case "logos":
      return (
        <section className={section}>
          <h2 className="text-center font-medium text-fg-muted">{block.title}</h2>
          <ul className="mt-6 flex flex-wrap justify-center gap-8 font-display text-xl font-semibold">
            {block.names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      );
    case "testimonial":
      return (
        <section className="bg-surface">
          <figure className={section}>
            <blockquote className="max-w-3xl font-display text-2xl">“{block.quote}”</blockquote>
            <figcaption className="mt-4 text-fg-muted">
              <span className="font-medium text-fg">{block.author}</span> · {block.role}
            </figcaption>
          </figure>
        </section>
      );
    case "faq":
      return (
        <section className={section}>
          <h2 className="font-display text-3xl font-bold tracking-tight">{block.title}</h2>
          <div className="mt-6 space-y-3">
            {block.items.map((item) => (
              <details
                key={item.question}
                className="rounded-[var(--radius-card)] border border-border p-4"
              >
                <summary className="cursor-pointer font-medium">{item.question}</summary>
                <p className="mt-2 text-fg-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="bg-surface-accent">
          <div className={`${section} text-center`}>
            <h2 className="font-display text-3xl font-bold tracking-tight">{block.title}</h2>
            <p className="mt-4 text-fg-muted">{block.text}</p>
            <div className="mt-8">
              <Cta label={block.ctaLabel} target={block.ctaTarget} />
            </div>
          </div>
        </section>
      );
    case "form":
      // On the site the page renders the real LeadForm island in place of this block.
      if (!preview) return null;
      return (
        <section id="formulario" className={section}>
          <h2 className="font-display text-3xl font-bold tracking-tight">{block.title}</h2>
          <form aria-label="Vista previa del formulario" className="mt-6 max-w-xl space-y-3">
            <fieldset disabled className="space-y-3">
              {block.fields.map((field) => (
                <div key={field}>
                  <p className="text-sm font-medium">{fieldLabels[field]}</p>
                  <div className="mt-1 h-11 rounded-[var(--radius-control)] border border-border bg-background" />
                </div>
              ))}
              <span className={`${ctaClass} opacity-60`}>{block.submitLabel}</span>
            </fieldset>
          </form>
        </section>
      );
  }
}
