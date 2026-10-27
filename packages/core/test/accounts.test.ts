import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import {
  createCompany,
  createContact,
  listCompanies,
  normalizePhonePe,
  softDeleteCompany,
} from "../src/crm/accounts.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { companies, contacts, users } from "../src/db/schema.ts";

const ventas: Actor = { id: "v1", email: "v1@tekinsof.com", role: "ventas" };
const marketing: Actor = { id: "m1", email: "m1@tekinsof.com", role: "marketing" };

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: ventas.id, name: "Ventas", email: ventas.email, role: "ventas" },
    { id: marketing.id, name: "Marketing", email: marketing.email, role: "marketing" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("normalizePhonePe", () => {
  it("normaliza celulares peruanos y rechaza basura", () => {
    expect(normalizePhonePe("987 654 321")).toBe("+51987654321");
    expect(normalizePhonePe("51987654321")).toBe("+51987654321");
    expect(normalizePhonePe("+1 (415) 555-0100")).toBe("+14155550100");
    expect(normalizePhonePe("12")).toBeNull();
  });
});

describe("empresas", () => {
  it("crea una empresa válida con el actor como dueño", async () => {
    const result = await createCompany(db, ventas, { name: "Acme SAC", ruc: "20123456789" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select().from(companies).where(eq(companies.id, result.data.companyId));
    expect(row?.ownerId).toBe(ventas.id);
  });

  it("RUC 12345 es VALIDATION_ERROR y no inserta", async () => {
    const result = await createCompany(db, ventas, { name: "Mala SAC", ruc: "12345" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fields?.ruc).toBe("RUC inválido");
    }
    const rows = await db.select().from(companies).where(eq(companies.name, "Mala SAC"));
    expect(rows).toHaveLength(0);
  });

  it("RUC repetido es CONFLICT", async () => {
    const result = await createCompany(db, ventas, { name: "Otra SAC", ruc: "20123456789" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("marketing no puede crear empresas", async () => {
    const result = await createCompany(db, marketing, { name: "Mkt SAC" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("una empresa borrada lógicamente no aparece en la lista", async () => {
    const created = await createCompany(db, ventas, { name: "Borrable SAC" });
    if (!created.ok) throw new Error("setup");
    await softDeleteCompany(db, ventas, created.data.companyId);
    const list = await listCompanies(db, { q: "Borrable" });
    expect(list.rows).toHaveLength(0);
    const [row] = await db.select().from(companies).where(eq(companies.id, created.data.companyId));
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe("contactos", () => {
  it("guarda el teléfono en E.164 y el correo en minúsculas", async () => {
    const result = await createContact(db, ventas, {
      fullName: "Ana Torres",
      email: "Ana@Empresa.PE",
      phone: "987 654 321",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select().from(contacts).where(eq(contacts.id, result.data.contactId));
    expect(row?.phone).toBe("+51987654321");
    expect(row?.email).toBe("ana@empresa.pe");
  });

  it("un teléfono inválido es VALIDATION_ERROR en fields.phone", async () => {
    const result = await createContact(db, ventas, { fullName: "Sin Fono", phone: "12" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields?.phone).toBeDefined();
  });

  it("un correo repetido es CONFLICT", async () => {
    const result = await createContact(db, ventas, {
      fullName: "Ana Bis",
      email: "ana@empresa.pe",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });
});
