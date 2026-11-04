import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { auditEvents, contacts, opportunities, quotes, users } from "../src/db/schema.ts";
import { shareQuoteByWhatsapp, whatsappNumber } from "../src/sales/quote-whatsapp.ts";
import { createQuote, setQuoteItems, submitQuote } from "../src/sales/quotes.ts";
import { createFileStore } from "../src/storage/files.ts";

const seller: Actor = { id: "wa-s", email: "wa-s@tekinsof.com", role: "ventas" };
const other: Actor = { id: "wa-o", email: "wa-o@tekinsof.com", role: "ventas" };
const store = createFileStore({ driver: "local", bucket: "quotes-test" });
// A year no other test uses, so the PDF file names never collide across runs.
const NOW = new Date("2032-05-04T15:00:00.000Z");

let db: Db;
let close: () => Promise<void>;
let opportunityId = "";

async function quote(discountPct: string, submit = true): Promise<string> {
  const created = await createQuote(db, seller, { opportunityId }, NOW);
  if (!created.ok) throw new Error(created.error.message);
  await setQuoteItems(db, seller, created.data.quoteId, {
    discountPct,
    items: [{ description: "Soporte", quantity: "1", unitPriceCents: 100000 }],
  });
  if (submit) await submitQuote(db, seller, created.data.quoteId, NOW);
  return created.data.quoteId;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: seller.id, name: "Vendedora", email: seller.email, role: "ventas" },
    { id: other.id, name: "Otro", email: other.email, role: "ventas" },
  ]);
  const [contact] = await db
    .insert(contacts)
    .values({ fullName: "Ana Torres", phone: "999 888 777" })
    .returning({ id: contacts.id });
  const [opportunity] = await db
    .insert(opportunities)
    .values({ title: "Soporte", ownerId: seller.id, contactId: contact?.id })
    .returning({ id: opportunities.id });
  opportunityId = opportunity?.id ?? "";
});
afterAll(async () => {
  await close();
});

describe("whatsappNumber", () => {
  it("agrega 51 a un celular peruano y respeta un número internacional", () => {
    expect(whatsappNumber("999 888 777")).toBe("51999888777");
    expect(whatsappNumber("+51 959 926 642")).toBe("51959926642");
    expect(whatsappNumber("+1 (305) 555-0100")).toBe("13055550100");
    expect(whatsappNumber("01 234")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});

describe("shareQuoteByWhatsapp", () => {
  it("una aprobada queda enviada y devuelve el chat con el mensaje listo", async () => {
    const id = await quote("0");
    const result = await shareQuoteByWhatsapp(db, { store }, seller, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phone).toBe("51999888777");
    expect(result.data.url).toMatch(/^https:\/\/wa\.me\/51999888777\?text=/);
    const text = decodeURIComponent(result.data.url.split("text=")[1] ?? "");
    expect(text).toContain("Hola Ana Torres");
    expect(text).toContain("S/ 1,180.00");
    const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
    expect(row?.status).toBe("enviada");
    expect(row?.sentAt).not.toBeNull();
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.targetId, id));
    expect(audit.map((a) => a.action)).toContain("quote.shared_whatsapp");

    const again = await shareQuoteByWhatsapp(db, { store }, seller, id);
    expect(again.ok).toBe(true);
  });

  it("un borrador o una pendiente es APPROVAL_REQUIRED", async () => {
    for (const id of [await quote("0", false), await quote("20")]) {
      const result = await shareQuoteByWhatsapp(db, { store }, seller, id);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("APPROVAL_REQUIRED");
    }
  });

  it("otro vendedor no puede compartir la cotización ajena", async () => {
    const result = await shareQuoteByWhatsapp(db, { store }, other, await quote("0"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});
