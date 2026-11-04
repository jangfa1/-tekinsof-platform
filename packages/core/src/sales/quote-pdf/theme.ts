import { StyleSheet, Text, type TextProps, View } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";
import type { getQuote } from "../quote-queries.ts";

// Shared look of the quote PDF: Tekinsof brand colours (ink, greys, white; coral only as a thin
// accent) and the PDF's built-in Helvetica, so rendering never downloads a font.

export type CompanyProfile = {
  legalName: string;
  ruc: string;
  address: string;
  email: string;
  phone: string;
};
type QuoteData = NonNullable<Awaited<ReturnType<typeof getQuote>>>;
export type QuotePdfData = QuoteData & { issuer: CompanyProfile; today: string };

export const color = {
  ink: "#1E2126",
  muted: "#5B606B",
  border: "#E2E3E7",
  surface: "#F7F7F8",
  coral: "#FF7F5C",
  lilac: "#E7DBE7",
  white: "#FFFFFF",
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 64,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.4,
    color: color.ink,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: color.muted },
  label: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: color.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 8,
  },
  sectionMark: { width: 3, height: 12, backgroundColor: color.ink, marginRight: 6 },
  sectionText: { fontSize: 10, fontFamily: "Helvetica-Bold", letterSpacing: 0.8 },
  paragraph: { marginBottom: 4 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 4,
    padding: 12,
  },
});

type PdfStyle = NonNullable<TextProps["style"]>;
export const text = (
  style: PdfStyle,
  value: string,
  extra: Partial<TextProps> & { key?: string } = {},
) => h(Text, { style, ...extra } as TextProps, value);

// A numbered section heading; it never sits alone at the bottom of a page.
export function section(title: string): ReactElement {
  return h(
    View,
    { style: styles.sectionTitle, minPresenceAhead: 60 },
    h(View, { style: styles.sectionMark }),
    text(styles.sectionText, title.toUpperCase()),
  );
}

// "2026-11-04" → "04/11/2026" without a time-zone shift (the value is already a Lima date).
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export const currencyName = (currency: string) =>
  currency === "USD" ? "Dólares americanos (USD)" : "Soles (PEN)";
export const currencySymbol = (currency: string) => (currency === "USD" ? "US$" : "S/");

// Multi-line text kept as paragraphs; blank lines collapse.
export const lines = (value: string | null | undefined) =>
  (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
