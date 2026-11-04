import { View } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";
import { itemTypeLabels, type QuoteItemType } from "../quote-document.ts";
import { formatAmount, sectionSubtotals } from "../quote-math.ts";
import { color, currencySymbol, type QuotePdfData, section, styles, text } from "./theme.ts";

type Item = QuotePdfData["items"][number];
type Column = {
  title: string;
  width: string;
  align?: "right" | "left";
  cell: (item: Item) => string;
};

const cellPadding = { paddingVertical: 5, paddingHorizontal: 6 };

// "2.50" → "2.5", "3.00" → "3".
const quantity = (value: string) => value.replace(/\.?0+$/, "") || "0";
const typeLabel = (item: Item) => itemTypeLabels[item.itemType as QuoteItemType] ?? item.itemType;

function table(columns: Column[], items: Item[], subtotal: string, label: string): ReactElement {
  const header = h(
    View,
    { style: { flexDirection: "row", backgroundColor: color.ink }, fixed: true },
    ...columns.map((column) =>
      text(
        {
          ...cellPadding,
          width: column.width,
          color: color.white,
          fontFamily: "Helvetica-Bold",
          fontSize: 8,
          textAlign: column.align ?? "left",
        },
        column.title,
      ),
    ),
  );
  const rows = items.map((item, index) =>
    h(
      View,
      {
        key: item.id,
        wrap: false,
        style: {
          flexDirection: "row",
          backgroundColor: index % 2 ? color.surface : color.white,
          borderBottom: `0.5 solid ${color.border}`,
        },
      },
      ...columns.map((column) =>
        text(
          { ...cellPadding, width: column.width, textAlign: column.align ?? "left" },
          column.cell(item),
        ),
      ),
    ),
  );
  const footer = h(
    View,
    {
      style: {
        flexDirection: "row",
        justifyContent: "flex-end",
        borderTop: `1 solid ${color.ink}`,
      },
      wrap: false,
    },
    text({ ...cellPadding, ...styles.bold }, label),
    text({ ...cellPadding, ...styles.bold, width: "18%", textAlign: "right" }, subtotal),
  );
  return h(View, null, header, ...rows, footer);
}

export function itemTables(data: QuotePdfData, startAt: number): ReactElement[] {
  const symbol = currencySymbol(data.currency);
  const money = (cents: number) => `${symbol} ${formatAmount(cents)}`;
  const products = data.items.filter((item) => item.section === "producto");
  const services = data.items.filter((item) => item.section !== "producto");
  const { productsCents, servicesCents } = sectionSubtotals(data.items);
  const amounts: Column[] = [
    { title: "Cant.", width: "8%", align: "right", cell: (i) => quantity(i.quantity) },
    { title: "P. unitario", width: "16%", align: "right", cell: (i) => money(i.unitPriceCents) },
    { title: "Total", width: "18%", align: "right", cell: (i) => money(i.lineTotalCents) },
  ];
  const out: ReactElement[] = [];
  let n = startAt;
  if (products.length) {
    out.push(
      h(
        View,
        { key: "products" },
        section(`${n++}. Detalle de productos`),
        table(
          [
            { title: "Tipo", width: "12%", cell: typeLabel },
            { title: "Part number", width: "14%", cell: (i) => i.partNumber ?? "—" },
            { title: "Descripción", width: "32%", cell: (i) => i.description },
            ...amounts,
          ],
          products,
          money(productsCents),
          "Subtotal productos",
        ),
      ),
    );
  }
  if (services.length) {
    out.push(
      h(
        View,
        { key: "services" },
        section(`${n++}. Detalle de servicios`),
        table(
          [
            { title: "Tipo de servicio", width: "18%", cell: typeLabel },
            { title: "Descripción", width: "40%", cell: (i) => i.description },
            ...amounts,
          ],
          services,
          money(servicesCents),
          "Subtotal servicios",
        ),
      ),
    );
  }
  return out;
}

function summaryRow(label: string, value: string): ReactElement {
  return h(
    View,
    {
      style: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderBottom: `0.5 solid ${color.border}`,
      },
    },
    text(styles.muted, label),
    text({ fontFamily: "Helvetica" }, value),
  );
}

export function economicSummary(data: QuotePdfData, n: number): ReactElement {
  const symbol = currencySymbol(data.currency);
  const money = (cents: number) => `${symbol} ${formatAmount(cents)}`;
  const { productsCents, servicesCents } = sectionSubtotals(data.items);
  const discount = data.discountPct.replace(/\.?0+$/, "");
  return h(
    View,
    { wrap: false },
    section(`${n}. Resumen económico`),
    h(
      View,
      { style: { marginLeft: "auto", width: "55%", border: `0.5 solid ${color.border}` } },
      summaryRow("Subtotal productos", money(productsCents)),
      summaryRow("Subtotal servicios", money(servicesCents)),
      summaryRow("Subtotal general", money(data.subtotalCents)),
      data.discountCents > 0
        ? summaryRow(`Descuento (${discount}%)`, `- ${money(data.discountCents)}`)
        : null,
      summaryRow("IGV (18%)", money(data.igvCents)),
      h(
        View,
        {
          style: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: color.ink,
            paddingVertical: 8,
            paddingHorizontal: 10,
          },
        },
        text({ color: color.white, fontFamily: "Helvetica-Bold", fontSize: 10 }, "TOTAL"),
        text(
          { color: color.white, fontFamily: "Helvetica-Bold", fontSize: 13 },
          money(data.totalCents),
        ),
      ),
    ),
  );
}
