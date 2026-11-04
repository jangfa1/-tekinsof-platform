import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { handleLeadCreated } from "../src/automation/lead-created.ts";
import { ingestExternalLead } from "../src/capture/external-leads.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { leadScores, leads, scoringModels, users } from "../src/db/schema.ts";
import { createMailer } from "../src/integrations/graph.ts";
import { createPublicLead } from "../src/leads/leads.ts";
import {
  getActiveModel,
  rescoreAll,
  scoreAndStore,
  updateLeadQualification,
} from "../src/scoring/lead-scoring.ts";
import { defaultScoringModel } from "../src/scoring/model.ts";
import {
  normalizeBudget,
  normalizeCompanySize,
  normalizeCompanyType,
  qualificationFromAnswers,
} from "../src/scoring/normalize.ts";
import { gradeFor, type ScoringInput, scoreLead } from "../src/scoring/rules.ts";

const gerencia: Actor = { id: "s-g", email: "g@tekinsof.com", role: "gerencia" };
const ventasA: Actor = { id: "s-va", email: "va@tekinsof.com", role: "ventas" };
const ventasB: Actor = { id: "s-vb", email: "vb@tekinsof.com", role: "ventas" };
const now = new Date("2026-10-30T20:00:00Z");

const strong: ScoringInput = {
  source: "google_lead_form",
  serviceInterest: "integracion-erp",
  budgetRange: "mas-50k",
  companySize: "201+",
  companyType: "privada",
  email: "gerente@empresa.pe",
  phone: "+51987654321",
  companyName: "Empresa SAC",
  message: "Necesitamos integrar nuestro ERP con ventas y logística este trimestre.",
};

describe("scoreLead (reglas)", () => {
  it("un lead completo y fuerte es A con 100 puntos", () => {
    const result = scoreLead(strong, defaultScoringModel);
    expect(result).toMatchObject({ score: 100, grade: "A" });
    expect(result.reasons).toHaveLength(7);
    expect(result.reasons.every((reason) => reason.points === reason.max)).toBe(true);
  });

  it("sin presupuesto ni tamaño baja de grado y la explicación dice no indicado", () => {
    const result = scoreLead(
      { ...strong, budgetRange: null, companySize: null },
      defaultScoringModel,
    );
    expect(result).toMatchObject({ score: 65, grade: "B" });
    const details = result.reasons.map((reason) => reason.detail);
    expect(details).toContain("Presupuesto: no indicado");
    expect(details).toContain("Tamaño: no indicado");
  });

  it("un correo personal no suma y se explica", () => {
    const result = scoreLead({ ...strong, email: "ana@Gmail.com" }, defaultScoringModel);
    const email = result.reasons.find((reason) => reason.signal === "email");
    expect(email).toMatchObject({ points: 0, max: 10, detail: "Correo personal (gmail.com)" });
  });

  it("un lead mínimo de TikTok es D", () => {
    const result = scoreLead(
      { source: "tiktok_lead_ads", phone: "+51987654321" },
      defaultScoringModel,
    );
    expect(result).toMatchObject({ score: 6, grade: "D" });
  });

  it("los umbrales A ≥ 75, B ≥ 50, C ≥ 25 son inclusivos", () => {
    const t = defaultScoringModel.thresholds;
    expect([75, 74, 50, 49, 25, 24].map((score) => gradeFor(score, t))).toEqual([
      "A",
      "B",
      "B",
      "C",
      "C",
      "D",
    ]);
  });
});

describe("normalización de respuestas de anuncios", () => {
  it("lee tamaños, presupuestos y tipos escritos de muchas formas", () => {
    expect(
      ["1 a 10", "11-50", "51 a 200 empleados", "Más de 200", "mediana"].map(normalizeCompanySize),
    ).toEqual(["1-10", "11-50", "51-200", "201+", "51-200"]);
    expect(
      ["Menos de S/ 5,000", "S/ 10.000", "20 mil a 50 mil", "Más de 50,000", "5k-20k", "no sé"].map(
        normalizeBudget,
      ),
    ).toEqual(["hasta-5k", "5k-20k", "20k-50k", "mas-50k", "5k-20k", undefined]);
    expect(
      ["Empresa privada", "Municipalidad", "Asociación civil", "Persona natural"].map(
        normalizeCompanyType,
      ),
    ).toEqual(["privada", "publica", "ong", "independiente"]);
  });

  it("encuentra las preguntas por su texto, con o sin tildes", () => {
    expect(
      qualificationFromAnswers({
        "¿Cuántos colaboradores tiene tu empresa?": "51 a 200",
        presupuesto_estimado: "Más de 50 mil soles",
        "Tipo de organización": "Sector público",
        "¿Cuándo quieres empezar?": "Este mes",
      }),
    ).toEqual({ companySize: "51-200", budgetRange: "mas-50k", companyType: "publica" });
  });
});

let db: Db;
let close: () => Promise<void>;
const deps = () => ({
  mailer: createMailer({ driver: "log" }),
  systemSender: "notificaciones@tekinsof.com",
  crmBaseUrl: "https://crm.tekinsof.com",
  now: () => now,
});

const publicLead = {
  fullName: "Rosa Quispe",
  consent: true as const,
  consentVersion: "2026-10-30",
  turnstileToken: "token",
  website: "",
};

async function leadRow(id: string) {
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}
const history = (leadId: string) =>
  db.select().from(leadScores).where(eq(leadScores.leadId, leadId));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: gerencia.id, name: "Gerente", email: gerencia.email, role: "gerencia" },
    { id: ventasA.id, name: "Vendedora A", email: ventasA.email, role: "ventas" },
    {
      id: ventasB.id,
      name: "Vendedor B",
      email: ventasB.email,
      role: "ventas",
      receivesLeads: false,
    },
  ]);
});
afterAll(async () => {
  await close();
});

describe("calificación guardada", () => {
  it("activa el modelo v1 una sola vez", async () => {
    expect((await getActiveModel(db)).version).toBe(1);
    expect((await getActiveModel(db)).version).toBe(1);
    expect(await db.select().from(scoringModels)).toHaveLength(1);
  });

  it("el lead del sitio se califica al crearse, una sola vez aunque el evento se repita", async () => {
    const created = await createPublicLead(db, {
      ...publicLead,
      email: "rosa@industrias.pe",
      phone: "987654301",
      companyName: "Industrias Andinas",
      serviceInterest: "integracion-erp",
      companySize: "51-200",
      budgetRange: "20k-50k",
      companyType: "privada",
    });
    if (!created.ok || !created.data.leadId) throw new Error("lead");
    const leadId = created.data.leadId;
    await handleLeadCreated(db, deps(), leadId);
    await handleLeadCreated(db, deps(), leadId);

    // 20 service + 15 budget + 12 size + 12 web form + 10 type + 10 email + 5 interaction.
    expect(await leadRow(leadId)).toMatchObject({ score: 84, grade: "A", ownerId: ventasA.id });
    const rows = await history(leadId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scoringModelVersion: 1, score: 84, grade: "A" });
  });

  it("completar la calificación agrega historial y el lead refleja la última", async () => {
    const created = await createPublicLead(db, { ...publicLead, email: "luis@gmail.com" });
    if (!created.ok || !created.data.leadId) throw new Error("lead");
    const leadId = created.data.leadId;
    await handleLeadCreated(db, deps(), leadId);
    const before = await leadRow(leadId);
    expect(before?.grade).toBe("D");

    const forbidden = await updateLeadQualification(
      db,
      ventasB,
      { leadId, budgetRange: "mas-50k" },
      now,
    );
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");

    const updated = await updateLeadQualification(
      db,
      ventasA,
      { leadId, budgetRange: "mas-50k", companySize: "201+", companyType: "privada" },
      new Date("2026-10-30T21:00:00Z"),
    );
    expect(updated).toMatchObject({ ok: true, data: { score: 57, grade: "B" } });
    expect(await leadRow(leadId)).toMatchObject({ score: 57, grade: "B", budgetRange: "mas-50k" });
    expect(await history(leadId)).toHaveLength(2);
  });

  it("un lead de prueba de la plataforma no se califica", async () => {
    const ingested = await ingestExternalLead(db, {
      provider: "meta",
      externalLeadId: "test-lead-1",
      externalFormId: "form-scoring",
      adPlatform: "facebook",
      fullName: "Lead de prueba",
      email: "test@fb.com",
      submittedAt: now.toISOString(),
      isTest: true,
    });
    if (!ingested.ok) throw new Error("ingest");
    expect(await scoreAndStore(db, ingested.data.leadId, now)).toEqual({ ok: true, data: null });
    expect((await leadRow(ingested.data.leadId))?.grade).toBeNull();
    expect(await history(ingested.data.leadId)).toHaveLength(0);
  });

  it("un lead de anuncio guarda las respuestas normalizadas y se califica con ellas", async () => {
    const ingested = await ingestExternalLead(db, {
      provider: "google_ads",
      externalLeadId: "g-lead-1",
      externalFormId: "g-form-1",
      adPlatform: "google",
      fullName: "Carlos Díaz",
      email: "carlos@constructora.pe",
      rawAnswers: { tamaño_de_la_empresa: "Más de 200", presupuesto: "S/ 30,000" },
      submittedAt: now.toISOString(),
    });
    if (!ingested.ok) throw new Error("ingest");
    const result = await scoreAndStore(db, ingested.data.leadId, now);
    // 0 service + 15 budget + 15 size + 15 Google form + 0 type + 10 email + 0 interaction.
    expect(result).toMatchObject({ ok: true, data: { score: 55, grade: "B" } });
    expect(await leadRow(ingested.data.leadId)).toMatchObject({
      companySize: "201+",
      budgetRange: "20k-50k",
    });
  });

  it("recalificar todo es solo para Gerencia", async () => {
    const forbidden = await rescoreAll(db, ventasA, now);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");
    const result = await rescoreAll(db, gerencia, now);
    expect(result).toEqual({ ok: true, data: { rescored: 3 } });
  });
});
