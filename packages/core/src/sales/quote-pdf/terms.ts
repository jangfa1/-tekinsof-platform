import { View } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";
import { VALIDITY_DAYS } from "../quotes.ts";
import {
  color,
  currencyName,
  formatDay,
  lines,
  type QuotePdfData,
  section,
  styles,
  text,
} from "./theme.ts";

// Cover letter, commercial conditions, remarks and the seller's signature.

export function introduction(data: QuotePdfData): ReactElement {
  const contact = data.contact?.fullName;
  return h(
    View,
    { style: { marginTop: 16 } },
    contact ? text({ ...styles.bold, marginBottom: 6 }, `Atención: ${contact}`) : null,
    ...lines(data.intro).map((line, index) =>
      text(styles.paragraph, line, { key: `intro-${index}` }),
    ),
  );
}

function condition(label: string, value: string, wide = false): ReactElement {
  return h(
    View,
    {
      wrap: false,
      style: {
        width: wide ? "100%" : "50%",
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderBottom: `0.5 solid ${color.border}`,
      },
    },
    text(styles.label, label),
    ...lines(value || "—").map((line, index) => text({}, line, { key: `${label}-${index}` })),
  );
}

export function commercialConditions(data: QuotePdfData, n: number): ReactElement {
  const validity = data.validUntil
    ? `${VALIDITY_DAYS} días calendario, hasta el ${formatDay(data.validUntil)}`
    : `${VALIDITY_DAYS} días calendario desde la fecha de emisión`;
  const rate =
    data.currency === "USD"
      ? `S/ ${data.exchangeRate.replace(/0+$/, "").replace(/\.$/, "")} por US$ 1 (referencial)`
      : "No aplica";
  // Kept on one page with its heading: it is short and reads as one block.
  return h(
    View,
    { wrap: false },
    section(`${n}. Condiciones comerciales`),
    h(
      View,
      {
        style: {
          flexDirection: "row",
          flexWrap: "wrap",
          borderTop: `0.5 solid ${color.border}`,
        },
      },
      condition("Forma de pago", data.paymentTerms ?? ""),
      condition("Tiempo de entrega", data.deliveryTime ?? ""),
      condition("Vigencia de la oferta", validity),
      condition("Moneda", currencyName(data.currency)),
      condition("Tipo de cambio", rate),
      condition("Garantía", data.warranty ?? ""),
      condition("Alcances", data.scope ?? "", true),
      condition("Exclusiones", data.exclusions ?? "", true),
      data.terms ? condition("Otras condiciones", data.terms, true) : null,
    ),
  );
}

export function observations(data: QuotePdfData, n: number): ReactElement | null {
  const items = [...lines(data.observations), ...lines(data.notes)];
  if (!items.length) return null;
  return h(
    View,
    null,
    section(`${n}. Observaciones`),
    ...items.map((item, index) =>
      h(
        View,
        { key: `obs-${index}`, style: { flexDirection: "row", marginBottom: 3 }, wrap: false },
        text({ width: 12, color: color.muted }, "•"),
        text({ flex: 1 }, item.replace(/^[-•]\s*/, "")),
      ),
    ),
  );
}

function signatureRow(label: string, value: string | null | undefined): ReactElement | null {
  if (!value) return null;
  return h(
    View,
    { style: { flexDirection: "row" } },
    text({ ...styles.muted, width: 50 }, `${label}:`),
    text({}, value),
  );
}

export function signature(data: QuotePdfData): ReactElement {
  const { owner, issuer } = data;
  return h(
    View,
    { wrap: false, style: { marginTop: 28 } },
    text({}, "Atentamente,"),
    h(View, { style: { width: 200, borderBottom: `0.75 solid ${color.ink}`, marginTop: 36 } }),
    h(
      View,
      { style: { marginTop: 6 } },
      signatureRow("Nombre", owner?.name ?? issuer.legalName),
      signatureRow("Cargo", owner?.jobTitle ?? "Ejecutivo comercial"),
      signatureRow("Empresa", issuer.legalName),
      signatureRow("Correo", owner?.email ?? issuer.email),
      signatureRow("Teléfono", owner?.phone ?? issuer.phone),
    ),
  );
}
