import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";
import { clientBlock, documentHeader, runningElements } from "./header.ts";
import { economicSummary, itemTables } from "./tables.ts";
import { commercialConditions, introduction, observations, signature } from "./terms.ts";
import { type QuotePdfData, styles } from "./theme.ts";

// The quote as a B2B commercial proposal (A4, may span pages): header, client, cover letter,
// products, services, economic summary, conditions, remarks and signature.
// Built with createElement: core has no JSX outside cms/blocks.tsx.
export function quoteDocument(data: QuotePdfData): ReactElement {
  const tables = itemTables(data, 1);
  let n = tables.length + 1;
  const summary = economicSummary(data, n++);
  const conditions = commercialConditions(data, n++);
  const remarks = observations(data, n);
  return h(
    Document,
    {
      title: `Cotización ${data.number} v${data.version}`,
      author: data.issuer.legalName,
      subject: data.company?.name ?? data.opportunity?.title ?? "Cotización",
      language: "es-PE",
    },
    h(
      Page,
      { size: "A4", style: styles.page },
      ...runningElements(data),
      documentHeader(data),
      clientBlock(data),
      introduction(data),
      ...tables,
      summary,
      conditions,
      remarks,
      signature(data),
    ),
  );
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
  // biome-ignore lint/suspicious/noExplicitAny: react-pdf types renderToBuffer for its Document element only
  return new Uint8Array(await renderToBuffer(quoteDocument(data) as any));
}
