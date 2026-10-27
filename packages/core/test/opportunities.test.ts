import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { companies, contacts, leads, opportunities, users } from "../src/db/schema.ts";
import {
  closeOpportunity,
  createOpportunity,
  moveOpportunity,
} from "../src/sales/opportunities.ts";

const ana: Actor = { id: "ana", email: "ana@tekinsof.com", role: "ventas" };
const beto: Actor = { id: "beto", email: "beto@tekinsof.com", role: "ventas" };

let db: Db;
let close: () => Promise<void>;

async function lead(status: string, name: string) {
  const [row] = await db
    .insert(leads)
    .values({
      source: "manual",
      status,
      fullName: name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@cliente.pe`,
      phone: "+51987654321",
      companyName: "Cliente SAC",
      ownerId: ana.id,
    })
    .returning({ id: leads.id });
  if (!row) throw new Error("setup");
  return row.id;
}

async function opportunity(actor: Actor, title: string) {
  const result = await createOpportunity(db, actor, { title });
  if (!result.ok) throw new Error(result.error.message);
  return result.data.opportunityId;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: ana.id, name: "Ana", email: ana.email, role: "ventas" },
    { id: beto.id, name: "Beto", email: beto.email, role: "ventas" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("convertir un lead", () => {
  let qualified = "";

  it("un lead nuevo no se convierte", async () => {
    const id = await lead("nuevo", "Lead Nuevo");
    const result = await createOpportunity(db, ana, { title: "ERP", leadId: id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("un lead calificado crea oportunidad, contacto y empresa", async () => {
    qualified = await lead("calificado", "Lead Calificado");
    const result = await createOpportunity(db, ana, {
      title: "Integración ERP",
      leadId: qualified,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, result.data.opportunityId));
    expect(opp?.leadId).toBe(qualified);
    expect(opp?.stage).toBe("calificacion");
    const [row] = await db.select().from(leads).where(eq(leads.id, qualified));
    expect(row?.status).toBe("convertido");
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, row?.contactId ?? ""));
    expect(contact?.fullName).toBe("Lead Calificado");
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, row?.companyId ?? ""));
    expect(company?.name).toBe("Cliente SAC");
  });

  it("una segunda conversión es CONFLICT y no crea nada", async () => {
    const before = await db.select().from(opportunities);
    const result = await createOpportunity(db, ana, { title: "Otra", leadId: qualified });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
    expect(await db.select().from(opportunities)).toHaveLength(before.length);
  });
});

describe("pipeline", () => {
  it("un ventas no mueve la oportunidad de otro", async () => {
    const id = await opportunity(ana, "De Ana");
    const result = await moveOpportunity(db, beto, {
      opportunityId: id,
      toStage: "propuesta",
      toPosition: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("perder sin motivo es VALIDATION_ERROR", async () => {
    const id = await opportunity(ana, "Sin motivo");
    const result = await closeOpportunity(db, ana, { opportunityId: id, outcome: "perdida" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("mover a la posición 0 de una columna de 3 deja [0, 1, 2, 3]", async () => {
    const ids = [];
    for (const title of ["N1", "N2", "N3"]) {
      const id = await opportunity(ana, title);
      const moved = await moveOpportunity(db, ana, {
        opportunityId: id,
        toStage: "negociacion",
        toPosition: 99,
      });
      expect(moved.ok).toBe(true);
      ids.push(id);
    }
    const card = await opportunity(ana, "N0");
    const result = await moveOpportunity(db, ana, {
      opportunityId: card,
      toStage: "negociacion",
      toPosition: 0,
    });
    expect(result.ok).toBe(true);
    const column = await db
      .select({ id: opportunities.id, position: opportunities.position })
      .from(opportunities)
      .where(and(eq(opportunities.stage, "negociacion"), isNull(opportunities.deletedAt)))
      .orderBy(asc(opportunities.position));
    expect(column.map((row) => row.position)).toEqual([0, 1, 2, 3]);
    expect(column.map((row) => row.id)).toEqual([card, ...ids]);
  });
});
