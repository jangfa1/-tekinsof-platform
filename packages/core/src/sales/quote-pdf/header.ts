import { Polygon, Svg, Text, View } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";
import { color, formatDay, type QuotePdfData, styles, text } from "./theme.ts";

// The Tekinsof mark (three slanted bars: ink, coral, lilac — same geometry as the site favicon,
// skewX(-12)) next to the wordmark. Drawn as vectors, so the PDF needs no image file.
function bar(x: number, fill: string): ReactElement {
  const top = 7;
  const bottom = 25;
  const slant = (y: number) => -0.2126 * y;
  const points = [
    [x + slant(top), top],
    [x + 4 + slant(top), top],
    [x + 4 + slant(bottom), bottom],
    [x + slant(bottom), bottom],
  ]
    .map(([px, py]) => `${px?.toFixed(2)},${py}`)
    .join(" ");
  return h(Polygon, { points, fill });
}

export function logo(): ReactElement {
  return h(
    View,
    { style: { flexDirection: "row", alignItems: "center" } },
    h(
      Svg,
      { width: 30, height: 28, viewBox: "4 6 22 20" },
      bar(10, color.ink),
      bar(16, color.coral),
      bar(22, color.lilac),
    ),
    h(
      View,
      { style: { marginLeft: 6 } },
      text({ fontSize: 16, fontFamily: "Helvetica-Bold", lineHeight: 1 }, "Tekinsof"),
      text({ fontSize: 8, color: color.muted, letterSpacing: 1.6 }, "CONSULTING"),
    ),
  );
}

const DRAFT = new Set(["borrador", "pendiente_aprobacion"]);

function metaRow(label: string, value: string): ReactElement {
  return h(
    View,
    { style: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 } },
    text(styles.muted, label),
    text(styles.bold, value),
  );
}

export function documentHeader(data: QuotePdfData): ReactElement {
  const { issuer } = data;
  return h(
    View,
    null,
    h(
      View,
      { style: { flexDirection: "row", justifyContent: "space-between" } },
      h(
        View,
        { style: { width: "55%" } },
        logo(),
        h(
          View,
          { style: { marginTop: 10 } },
          text(styles.bold, issuer.legalName),
          issuer.ruc ? text(styles.muted, `RUC ${issuer.ruc}`) : null,
          text(styles.muted, issuer.address),
          text(styles.muted, `${issuer.email} · ${issuer.phone}`),
        ),
      ),
      h(
        View,
        { style: { width: "38%" } },
        text(
          {
            fontSize: 18,
            lineHeight: 1.2,
            fontFamily: "Helvetica-Bold",
            letterSpacing: 1,
            textAlign: "right",
          },
          "COTIZACIÓN",
        ),
        h(
          View,
          { style: [styles.card, { marginTop: 8, paddingVertical: 8 }] },
          metaRow("N.º", data.number),
          metaRow("Fecha de emisión", formatDay(data.issuedOn ?? data.today)),
          metaRow("Versión", String(data.version)),
          data.validUntil ? metaRow("Válida hasta", formatDay(data.validUntil)) : null,
        ),
        DRAFT.has(data.status)
          ? text(
              { ...styles.label, color: color.muted, textAlign: "right", marginTop: 6 },
              "Borrador — no válido para el cliente",
            )
          : null,
      ),
    ),
    h(View, { style: { height: 2, backgroundColor: color.coral, marginTop: 14 } }),
  );
}

const FOOTER_TOP = 800;
const footerBox = { position: "absolute" as const, left: 40, right: 40 };
const footerText = { top: FOOTER_TOP + 6, fontSize: 7, color: color.muted };

// Repeated on every page: a slim running header after page 1 and the footer with page numbers.
export function runningElements(data: QuotePdfData): ReactElement[] {
  const { issuer } = data;
  return [
    h(Text, {
      key: "running-header",
      fixed: true,
      style: {
        position: "absolute",
        top: 16,
        left: 40,
        right: 40,
        fontSize: 7,
        color: color.muted,
      },
      render: ({ pageNumber }: { pageNumber: number }) =>
        pageNumber > 1 ? `${issuer.legalName} · Cotización ${data.number} · v${data.version}` : "",
    }),
    // Pinned with `top` (A4 is 841.89 pt high): react-pdf drops fixed elements anchored by `bottom`.
    h(View, {
      key: "footer-rule",
      fixed: true,
      style: { ...footerBox, top: FOOTER_TOP, height: 0.5, backgroundColor: color.border },
    }),
    h(
      Text,
      { key: "footer-issuer", fixed: true, style: { ...footerBox, ...footerText } },
      [issuer.legalName, issuer.ruc ? `RUC ${issuer.ruc}` : "", issuer.email, issuer.phone]
        .filter(Boolean)
        .join(" · "),
    ),
    h(Text, {
      key: "footer-page",
      fixed: true,
      style: { ...footerBox, ...footerText, textAlign: "right" },
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Página ${pageNumber} de ${totalPages}`,
    }),
  ];
}

function field(label: string, value: string | null | undefined): ReactElement {
  return h(
    View,
    { style: { width: "50%", marginBottom: 6, paddingRight: 8 } },
    text(styles.label, label),
    text({}, value?.trim() || "—"),
  );
}

export function clientBlock(data: QuotePdfData): ReactElement {
  const { company, contact } = data;
  return h(
    View,
    { style: [styles.card, { marginTop: 14 }], wrap: false },
    text({ ...styles.label, color: color.ink, marginBottom: 8 }, "Datos del cliente"),
    h(
      View,
      { style: { flexDirection: "row", flexWrap: "wrap" } },
      field("Razón social", company?.name),
      field("RUC", company?.ruc),
      field("Contacto", contact?.fullName),
      field("Cargo", contact?.jobTitle),
      field("Correo", contact?.email),
      field("Teléfono", contact?.phone ?? company?.phone),
    ),
  );
}
