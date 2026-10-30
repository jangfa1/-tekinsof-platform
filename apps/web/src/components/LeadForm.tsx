import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";

type FieldName = "fullName" | "email" | "phone" | "companyName" | "serviceInterest" | "message";

type Props = {
  apiUrl: string;
  siteKey: string;
  services: { slug: string; name: string }[];
  defaultService?: string;
  landingSlug?: string;
  campaignSlug?: string;
  fields?: FieldName[];
  submitLabel?: string;
  consentVersion: string;
  whatsappHref: string;
};

type Attribution = {
  utm: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    dataLayer?: unknown[];
  }
}

const DEFAULT_FIELDS: FieldName[] = [
  "fullName",
  "email",
  "phone",
  "companyName",
  "serviceInterest",
  "message",
];
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const labels: Record<FieldName, string> = {
  fullName: "Nombre y apellido",
  email: "Correo",
  phone: "Teléfono / WhatsApp",
  companyName: "Empresa",
  serviceInterest: "Servicio de interés",
  message: "¿En qué te ayudamos?",
};

// First touch wins: the attribution of the visit that brought the prospect is kept for the session.
function readAttribution(): Attribution {
  try {
    const stored = sessionStorage.getItem("tk_utm");
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
      referrer: document.referrer || undefined,
    };
    sessionStorage.setItem("tk_utm", JSON.stringify(attribution));
    return attribution;
  } catch {
    return { utm: {} };
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () =>
      window.turnstile ? resolve(window.turnstile) : reject(),
    );
    script.addEventListener("error", () => reject());
  });
}

export default function LeadForm({
  apiUrl,
  siteKey,
  services,
  defaultService,
  landingSlug,
  campaignSlug,
  fields = DEFAULT_FIELDS,
  submitLabel = "Quiero que me contacten",
  consentVersion,
  whatsappHref,
}: Props) {
  const id = useId();
  const widgetRef = useRef<HTMLDivElement>(null);
  const attribution = useRef<Attribution>({ utm: {} });
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    attribution.current = readAttribution();
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (!cancelled && widgetRef.current && !widgetRef.current.hasChildNodes()) {
          api.render(widgetRef.current, { sitekey: siteKey, callback: setToken });
        }
      })
      .catch(() =>
        setErrors((e) => ({ ...e, turnstileToken: "No se pudo cargar la verificación" })),
      );
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim() || undefined;
    if (!token) {
      setErrors({ turnstileToken: "Completa la verificación antes de enviar" });
      return;
    }
    setStatus("sending");
    setErrors({});
    const { utm, gclid, fbclid, referrer } = attribution.current;
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: value("fullName") ?? "",
          email: value("email"),
          phone: value("phone"),
          companyName: value("companyName"),
          serviceInterest: value("serviceInterest") ?? defaultService,
          message: value("message"),
          consent: form.get("consent") === "on",
          consentVersion,
          landingSlug,
          campaignSlug,
          utm,
          gclid,
          fbclid,
          referrer,
          turnstileToken: token,
          website: String(form.get("website") ?? ""),
        }),
      });
      if (res.status === 200 || res.status === 201) {
        setStatus("done");
        window.dataLayer?.push({ event: "lead_submitted" });
        return;
      }
      if (res.status === 400) {
        const body = (await res.json()) as { error?: { fields?: Record<string, string> } };
        setErrors(body.error?.fields ?? { _: "Revisa los datos del formulario" });
        setStatus("idle");
        return;
      }
      setStatus("failed");
    } catch {
      setStatus("failed");
    }
    window.turnstile?.reset();
    setToken("");
  }

  if (status === "done") {
    return (
      <p role="status" className="rounded-[var(--radius-card)] bg-surface-accent p-6 font-medium">
        ¡Gracias! Te escribiremos en menos de 4 horas laborables.
      </p>
    );
  }

  const inputClass =
    "mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2";
  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`${id}-${name}-error`} role="alert" className="mt-1 text-sm text-destructive">
        {errors[name]}
      </p>
    ) : null;
  const describedBy = (name: string) => (errors[name] ? `${id}-${name}-error` : undefined);
  const required = (name: FieldName) => name === "fullName";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {fields.map((name) => (
        <div key={name}>
          <label htmlFor={`${id}-${name}`} className="block text-sm font-medium">
            {labels[name]}
            {required(name) ? " *" : ""}
          </label>
          {name === "serviceInterest" ? (
            <select
              id={`${id}-${name}`}
              name={name}
              defaultValue={defaultService ?? ""}
              className={inputClass}
            >
              <option value="">Selecciona un servicio</option>
              {services.map((service) => (
                <option key={service.slug} value={service.slug}>
                  {service.name}
                </option>
              ))}
            </select>
          ) : name === "message" ? (
            <textarea
              id={`${id}-${name}`}
              name={name}
              rows={4}
              maxLength={2000}
              aria-describedby={describedBy(name)}
              className={inputClass}
            />
          ) : (
            <input
              id={`${id}-${name}`}
              name={name}
              type={name === "email" ? "email" : name === "phone" ? "tel" : "text"}
              autoComplete={
                name === "fullName"
                  ? "name"
                  : name === "email"
                    ? "email"
                    : name === "phone"
                      ? "tel"
                      : "organization"
              }
              required={required(name)}
              aria-invalid={errors[name] ? true : undefined}
              aria-describedby={describedBy(name)}
              className={inputClass}
            />
          )}
          {fieldError(name)}
        </div>
      ))}

      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>No completar</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            name="consent"
            type="checkbox"
            required
            className="mt-1 size-4"
            aria-describedby={describedBy("consent")}
          />
          <span>
            Acepto la{" "}
            <a href="/privacidad" className="text-link underline">
              Política de privacidad
            </a>{" "}
            y autorizo a Tekinsof a usar mis datos para atender mi solicitud (Ley N.° 29733).
          </span>
        </label>
        {fieldError("consent")}
      </div>

      <div ref={widgetRef} />
      {fieldError("turnstileToken")}
      {fieldError("_")}

      {status === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          No pudimos enviar tu mensaje. Escríbenos por{" "}
          <a href={whatsappHref} className="text-link underline">
            WhatsApp
          </a>{" "}
          y te atendemos de inmediato.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-accent px-6 py-2 font-medium text-accent-fg disabled:opacity-60"
      >
        {status === "sending" ? "Enviando…" : submitLabel}
      </button>
    </form>
  );
}
