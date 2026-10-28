import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { defaultBlock, type LandingBlock } from "../src/cms/block-schema.ts";
import { Block } from "../src/cms/blocks.tsx";
import { publishLanding, saveLanding } from "../src/cms/landings.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { landingPages, outbox, sitePublishes, users } from "../src/db/schema.ts";

const marketing: Actor = { id: "m1", email: "m1@tekinsof.com", role: "marketing" };
const ventas: Actor = { id: "v1", email: "v1@tekinsof.com", role: "ventas" };
const hero = defaultBlock("hero");
const form = defaultBlock("form");

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: marketing.id, name: "Marketing", email: marketing.email, role: "marketing" },
    { id: ventas.id, name: "Ventas", email: ventas.email, role: "ventas" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("validación de bloques", () => {
  it("un hero con título de 91 caracteres falla en blocks.0.title", async () => {
    const result = await saveLanding(db, marketing, {
      slug: "larga",
      title: "Larga",
      blocks: [{ ...hero, title: "x".repeat(91) } as LandingBlock, form],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fields).toHaveProperty("blocks.0.title");
    }
  });

  it("dos bloques form se rechazan", async () => {
    const result = await saveLanding(db, marketing, {
      slug: "doble",
      title: "Doble",
      blocks: [hero, form, form],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("publicación", () => {
  let landingId = "";

  it("marketing publica y pide regenerar el sitio", async () => {
    const saved = await saveLanding(db, marketing, {
      slug: "erp-q4",
      title: "ERP Q4",
      blocks: [hero, form],
    });
    if (!saved.ok) throw new Error(saved.error.message);
    landingId = saved.data.landingId;
    const result = await publishLanding(db, marketing, landingId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [landing] = await db.select().from(landingPages).where(eq(landingPages.id, landingId));
    expect(landing?.status).toBe("publicada");
    expect(landing?.publishedAt).not.toBeNull();
    const publishes = await db.select().from(sitePublishes);
    expect(publishes.filter((p) => p.reason === "landing:erp-q4")).toHaveLength(1);
    const events = await db
      .select()
      .from(outbox)
      .where(eq(outbox.eventName, "site/publish.requested"));
    expect(events).toHaveLength(1);
  });

  it("ventas no puede publicar", async () => {
    const result = await publishLanding(db, ventas, landingId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("un slug repetido es CONFLICT", async () => {
    const result = await saveLanding(db, marketing, {
      slug: "erp-q4",
      title: "Otra",
      blocks: [hero],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });
});

describe("Block", () => {
  it("renderiza el título del hero", () => {
    const html = renderToStaticMarkup(createElement(Block, { block: hero }));
    expect(html).toContain(hero.type === "hero" ? hero.title : "");
    expect(html).toContain('href="#formulario"');
  });

  it("el bloque form no se renderiza fuera de la vista previa", () => {
    expect(renderToStaticMarkup(createElement(Block, { block: form }))).toBe("");
    expect(renderToStaticMarkup(createElement(Block, { block: form, preview: true }))).toContain(
      "Déjanos tus datos",
    );
  });
});
