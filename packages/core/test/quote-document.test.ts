import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { opportunities, quoteItems, quotes, users } from "../src/db/schema.ts";
import {
  builtInQuoteDefaults,
  getQuoteDefaults,
  setQuoteDefaults,
  updateQuoteDocument,
  updateUserSignature,
} from "../src/sales/quote-document.ts";
import { sectionSubtotals } from "../src/sales/quote-math.ts";
import { renderQuotePdf } from "../src/sales/quote-pdf/document.ts";
import { getQuote } from "../src/sales/quote-queries.ts";
import { createQuote, newQuoteVersion, setQuoteItems, submitQuote } from "../src/sales/quotes.ts";

const ventas: Actor = { id: "qd-v", email: "qd-v@tekinsof.com", role: "ventas" };
const gerencia: Actor = { id: "qd-g", email: "qd-g@tekinsof.com", role: "gerencia" };
const NOW = new Date("2026-11-04T15:00:00.000Z");

let db: Db;
let close: () => Promise<void>;
let opportunityId = "";

async function newDraft(): Promise<string> {
  const created = await createQuote(db, ventas, { opportunityId }, NOW);
  if (!created.ok) throw new Error(created.error.message);
  return created.data.quoteId;
}

async function quoteRow(id: string) {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  return row;
}

const mixedItems = {
  discountPct: "0",
  items: [
    {
      section: "producto" as const,
      itemType: "hardware",
      partNumber: "20VE00ABLM",
      description: "Laptop ThinkPad",
      quantity: "2",
      unitPriceCents: 450000,
    },
    {
      section: "servicio" as const,
      itemType: "implementacion",
      partNumber: "ignorado",
      description: "Configuración",
      quantity: "1",
      unitPriceCents: 80000,
    },
  ],
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: ventas.id, name: "Ventas", email: ventas.email, role: "ventas" },
    { id: gerencia.id, name: "Gerencia", email: gerencia.email, role: "gerencia" },
  ]);
  const [opportunity] = await db
    .insert(opportunities)
    .values({ title: "Renovación de equipos", ownerId: ventas.id })
    .returning({ id: opportunities.id });
  opportunityId = opportunity?.id ?? "";
});
afterAll(async () => {
  await close();
});

describe("ítems por sección", () => {
  it("guarda producto con part number y servicio sin él", async () => {
    const id = await newDraft();
    expect((await setQuoteItems(db, ventas, id, mixedItems)).ok).toBe(true);
    const rows = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
    expect(rows.find((r) => r.section === "producto")?.partNumber).toBe("20VE00ABLM");
    expect(rows.find((r) => r.section === "servicio")?.partNumber).toBeNull();
    expect(sectionSubtotals(rows)).toEqual({ productsCents: 900000, servicesCents: 80000 });
  });

  it("rechaza un tipo que no corresponde a la sección", async () => {
    const id = await newDraft();
    const result = await setQuoteItems(db, ventas, id, {
      discountPct: "0",
      items: [
        {
          section: "servicio",
          itemType: "hardware",
          description: "X",
          quantity: "1",
          unitPriceCents: 1,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("sin sección ni tipo queda como servicio de implementación", async () => {
    const id = await newDraft();
    await setQuoteItems(db, ventas, id, {
      discountPct: "0",
      items: [{ description: "Libre", quantity: "1", unitPriceCents: 100 }],
    });
    const [row] = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
    expect(row?.section).toBe("servicio");
    expect(row?.itemType).toBe("implementacion");
  });
});

describe("textos del documento", () => {
  it("una cotización nueva copia los valores por defecto", async () => {
    const row = await quoteRow(await newDraft());
    expect(row?.intro).toBe(builtInQuoteDefaults.intro);
    expect(row?.observations).toBe(builtInQuoteDefaults.observations);
  });

  it("solo Gerencia cambia los valores por defecto y las nuevas los heredan", async () => {
    const denied = await setQuoteDefaults(db, ventas, { paymentTerms: "Contado" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");
    const saved = await setQuoteDefaults(db, gerencia, {
      ...builtInQuoteDefaults,
      paymentTerms: "Crédito a 30 días",
    });
    expect(saved.ok).toBe(true);
    expect((await getQuoteDefaults(db)).paymentTerms).toBe("Crédito a 30 días");
    expect((await quoteRow(await newDraft()))?.paymentTerms).toBe("Crédito a 30 días");
  });

  it("edita un borrador, vacía con null y la nueva versión conserva los textos", async () => {
    const id = await newDraft();
    const updated = await updateQuoteDocument(db, ventas, id, {
      deliveryTime: "10 días hábiles",
      exclusions: "",
    });
    expect(updated.ok).toBe(true);
    expect((await quoteRow(id))?.deliveryTime).toBe("10 días hábiles");
    expect((await quoteRow(id))?.exclusions).toBeNull();

    await setQuoteItems(db, ventas, id, mixedItems);
    await submitQuote(db, ventas, id, NOW);
    const frozen = await updateQuoteDocument(db, ventas, id, { deliveryTime: "Otro" });
    expect(frozen.ok).toBe(false);
    if (!frozen.ok) expect(frozen.error.code).toBe("INVALID_TRANSITION");

    const v2 = await newQuoteVersion(db, ventas, id);
    if (!v2.ok) throw new Error(v2.error.message);
    expect((await quoteRow(v2.data.quoteId))?.deliveryTime).toBe("10 días hábiles");
  });
});

describe("firma", () => {
  it("cada uno edita la suya; solo Gerencia la de otros", async () => {
    const own = await updateUserSignature(db, ventas, ventas.id, {
      jobTitle: "Ejecutiva comercial",
      phone: "+51 999 888 777",
    });
    expect(own.ok).toBe(true);
    const other = await updateUserSignature(db, ventas, gerencia.id, {
      jobTitle: "X",
      phone: null,
    });
    expect(other.ok).toBe(false);
    const byManager = await updateUserSignature(db, gerencia, ventas.id, {
      jobTitle: "Jefa comercial",
      phone: "",
    });
    expect(byManager.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, ventas.id));
    expect(row?.jobTitle).toBe("Jefa comercial");
    expect(row?.phone).toBeNull();
  });
});

describe("PDF", () => {
  it("renderiza productos, servicios y condiciones en un PDF real", async () => {
    const id = await newDraft();
    await setQuoteItems(db, ventas, id, mixedItems);
    const quote = await getQuote(db, id);
    if (!quote) throw new Error("setup");
    const bytes = await renderQuotePdf({
      ...quote,
      today: "2026-11-04",
      issuer: {
        legalName: "Tekinsof Consulting",
        ruc: "20600000001",
        address: "Lima, Perú",
        email: "info@tekinsof.com",
        phone: "+51 959 926 642",
      },
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
    // QUOTE_PDF_OUT=<file> keeps a copy to review the layout by eye.
    if (process.env.QUOTE_PDF_OUT) writeFileSync(process.env.QUOTE_PDF_OUT, bytes);
  });
});
