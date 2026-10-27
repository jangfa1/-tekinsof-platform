import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { opportunities, outbox, quoteItems, quotes, users } from "../src/db/schema.ts";
import {
  approveQuote,
  createQuote,
  newQuoteVersion,
  setQuoteItems,
  submitQuote,
} from "../src/sales/quotes.ts";

const ventas: Actor = { id: "v1", email: "v1@tekinsof.com", role: "ventas" };
const gerencia: Actor = { id: "g1", email: "g1@tekinsof.com", role: "gerencia" };
const NOW = new Date("2026-11-02T15:00:00.000Z"); // lunes 2026-11-02 10:00 Lima

let db: Db;
let close: () => Promise<void>;
let opportunityId = "";

async function draft(discountPct = "0"): Promise<string> {
  const created = await createQuote(db, ventas, { opportunityId, currency: "PEN" }, NOW);
  if (!created.ok) throw new Error(created.error.message);
  const items = await setQuoteItems(db, ventas, created.data.quoteId, {
    discountPct,
    items: [
      { description: "Implementación", quantity: "1", unitPriceCents: 100000 },
      { description: "Horas de soporte", quantity: "2.5", unitPriceCents: 19999 },
    ],
  });
  if (!items.ok) throw new Error(items.error.message);
  return created.data.quoteId;
}

async function quoteRow(id: string) {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  return row;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: ventas.id, name: "Ventas", email: ventas.email, role: "ventas" },
    { id: gerencia.id, name: "Gerencia", email: gerencia.email, role: "gerencia" },
  ]);
  const [opportunity] = await db
    .insert(opportunities)
    .values({ title: "ERP", ownerId: ventas.id })
    .returning({ id: opportunities.id });
  if (!opportunity) throw new Error("setup");
  opportunityId = opportunity.id;
});
afterAll(async () => {
  await close();
});

describe("numeración", () => {
  it("dos cotizaciones seguidas terminan en -0001 y -0002", async () => {
    const first = await createQuote(db, ventas, { opportunityId }, NOW);
    const second = await createQuote(db, ventas, { opportunityId }, NOW);
    expect(first.ok && first.data.number).toBe("COT-2026-0001");
    expect(second.ok && second.data.number).toBe("COT-2026-0002");
    if (first.ok) expect((await quoteRow(first.data.quoteId))?.exchangeRate).toBe("3.7500");
  });
});

describe("ciclo de vida", () => {
  it("con 10% queda aprobada y vence a los 15 días", async () => {
    const id = await draft("10");
    const result = await submitQuote(db, ventas, id, NOW);
    expect(result.ok && result.data.status).toBe("aprobada");
    const row = await quoteRow(id);
    expect(row?.issuedOn).toBe("2026-11-02");
    expect(row?.validUntil).toBe("2026-11-17");
    // 100000 + round(2.5 × 19999) = 149998; −10% = 134998; +IGV 24300 = 159298.
    expect(row?.totalCents).toBe(159298);
  });

  it("con 10.01% queda pendiente de aprobación con un evento en outbox", async () => {
    const id = await draft("10.01");
    const result = await submitQuote(db, ventas, id, NOW);
    expect(result.ok && result.data.status).toBe("pendiente_aprobacion");
    const events = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventName, "quote/approval.requested"));
    expect(events.filter((e) => (e.payload as { quoteId: string }).quoteId === id)).toHaveLength(1);

    const denied = await approveQuote(db, ventas, id, { decision: "aprobar" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");
    expect((await quoteRow(id))?.status).toBe("pendiente_aprobacion");

    const approved = await approveQuote(db, gerencia, id, { decision: "aprobar" });
    expect(approved.ok && approved.data.status).toBe("aprobada");
    expect((await quoteRow(id))?.approvedBy).toBe(gerencia.id);
  });

  it("setQuoteItems sobre una enviada es INVALID_TRANSITION", async () => {
    const id = await draft();
    await db.update(quotes).set({ status: "enviada" }).where(eq(quotes.id, id));
    const result = await setQuoteItems(db, ventas, id, { discountPct: "0", items: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("newQuoteVersion deja v1 reemplazada y v2 borrador con los mismos ítems", async () => {
    const id = await draft("5");
    await submitQuote(db, ventas, id, NOW);
    const result = await newQuoteVersion(db, ventas, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [v1, v2] = [await quoteRow(id), await quoteRow(result.data.quoteId)];
    expect(v1?.status).toBe("reemplazada");
    expect(v2?.status).toBe("borrador");
    expect(v2?.version).toBe(2);
    expect(v2?.number).toBe(v1?.number);
    expect(v2?.issuedOn).toBeNull();
    const items = async (quoteId: string) =>
      (
        await db
          .select()
          .from(quoteItems)
          .where(eq(quoteItems.quoteId, quoteId))
          .orderBy(asc(quoteItems.sortOrder))
      ).map(({ description, quantity, unitPriceCents, lineTotalCents }) => ({
        description,
        quantity,
        unitPriceCents,
        lineTotalCents,
      }));
    expect(await items(result.data.quoteId)).toEqual(await items(id));
  });
});
