import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { companies, contacts, opportunities, quotes, users } from "../src/db/schema.ts";
import { createMailer } from "../src/integrations/graph.ts";
import { ensureQuotePdf, sendQuote } from "../src/sales/quote-delivery.ts";
import { createQuote, setQuoteItems, submitQuote } from "../src/sales/quotes.ts";
import { createFileStore } from "../src/storage/files.ts";

const seller: Actor = { id: "seller", email: "vendedora@tekinsof.com", role: "ventas" };
const store = createFileStore({ driver: "local", bucket: "quotes-test" });
const mailer = createMailer({ driver: "log" });
// A year no other test uses, so the PDF file names never collide across runs.
const NOW = new Date("2031-03-03T15:00:00.000Z");

let db: Db;
let close: () => Promise<void>;
let opportunityId = "";

async function quote(discountPct: string): Promise<string> {
  const created = await createQuote(db, seller, { opportunityId, currency: "USD" }, NOW);
  if (!created.ok) throw new Error(created.error.message);
  const items = await setQuoteItems(db, seller, created.data.quoteId, {
    discountPct,
    items: [{ description: "Integración ERP", quantity: "1", unitPriceCents: 500000 }],
  });
  if (!items.ok) throw new Error(items.error.message);
  const submitted = await submitQuote(db, seller, created.data.quoteId, NOW);
  if (!submitted.ok) throw new Error(submitted.error.message);
  return created.data.quoteId;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db
    .insert(users)
    .values({ id: seller.id, name: "Vendedora", email: seller.email, role: "ventas" });
  const [company] = await db
    .insert(companies)
    .values({ name: "Cliente SAC", ruc: "20123456789" })
    .returning({ id: companies.id });
  const [contact] = await db
    .insert(contacts)
    .values({ fullName: "Ana Torres", email: "ana@cliente.pe", companyId: company?.id })
    .returning({ id: contacts.id });
  const [opportunity] = await db
    .insert(opportunities)
    .values({ title: "ERP", ownerId: seller.id, companyId: company?.id, contactId: contact?.id })
    .returning({ id: opportunities.id });
  opportunityId = opportunity?.id ?? "";
});
afterAll(async () => {
  await close();
});

describe("PDF", () => {
  it("genera un PDF real de más de 1000 bytes", async () => {
    const id = await quote("5");
    const pdf = await ensureQuotePdf(db, { store }, id);
    expect(pdf.ok).toBe(true);
    if (!pdf.ok) return;
    expect(new TextDecoder().decode(pdf.data.bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.data.bytes.length).toBeGreaterThan(1000);
  });
});

describe("sendQuote", () => {
  it("una cotización pendiente de aprobación es APPROVAL_REQUIRED y no envía nada", async () => {
    const id = await quote("20");
    const before = mailer.outbox.length;
    const result = await sendQuote(db, { store, mailer }, seller, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("APPROVAL_REQUIRED");
    expect(mailer.outbox.length).toBe(before);
  });

  it("una aprobada sale del buzón del dueño con el PDF y queda enviada", async () => {
    const id = await quote("0");
    const result = await sendQuote(db, { store, mailer }, seller, id);
    expect(result.ok && result.data.to).toBe("ana@cliente.pe");
    const message = mailer.outbox.at(-1);
    expect(message?.from).toBe(seller.email);
    expect(message?.replyTo).toBe(seller.email);
    expect(message?.attachments?.[0]?.name).toMatch(/^COT-2031-\d{4}-v1\.pdf$/);
    expect(message?.attachments?.[0]?.contentType).toBe("application/pdf");

    const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
    expect(row?.status).toBe("enviada");
    expect(row?.sentAt).not.toBeNull();
    const stored = await store.get(message?.attachments?.[0]?.name ?? "");
    expect(stored.ok).toBe(true);
  });
});
