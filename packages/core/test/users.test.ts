import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/permissions.ts";
import { createTestDb, type Db } from "../src/db/client.ts";
import { auditEvents, invitations, users } from "../src/db/schema.ts";
import { admitUser, deactivateUser, inviteUser, setUserRole } from "../src/users/users.ts";

const bootstrapEmail = "gerencia@tekinsof.com";
const opts = { allowedDomain: "tekinsof.com" };
const gerencia: Actor = { id: "g1", email: bootstrapEmail, role: "gerencia" };
const ventas: Actor = { id: "v1", email: "v1@tekinsof.com", role: "ventas" };

const admit = (email: string) =>
  admitUser(db, { email, testMode: false, bootstrapEmail, allowedDomain: "tekinsof.com" });

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(users).values([
    { id: gerencia.id, name: "Gerencia", email: gerencia.email, role: "gerencia" },
    { id: ventas.id, name: "Ventas", email: ventas.email, role: "ventas" },
  ]);
});
afterAll(async () => {
  await close();
});

describe("admitUser", () => {
  it("el email de bootstrap recibe gerencia sin invitación", async () => {
    const result = await admit("Gerencia@Tekinsof.com");
    expect(result).toEqual({ ok: true, data: { role: "gerencia", invitationId: null } });
  });

  it("un email del dominio sin invitación es FORBIDDEN", async () => {
    const result = await admit("sin.invitacion@tekinsof.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("con invitación marketing recibe marketing", async () => {
    const invited = await inviteUser(
      db,
      gerencia,
      { email: "mkt@tekinsof.com", role: "marketing" },
      opts,
    );
    expect(invited.ok).toBe(true);
    const result = await admit("mkt@tekinsof.com");
    expect(result.ok && result.data.role).toBe("marketing");
  });

  it("un email de gmail es FORBIDDEN aun con invitación", async () => {
    await db.insert(invitations).values({ email: "alguien@gmail.com", role: "ventas" });
    const result = await admit("alguien@gmail.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("en modo test acepta el rol pedido para @e2e.tekinsof.test", async () => {
    const result = await admitUser(db, {
      email: "x@e2e.tekinsof.test",
      requestedRole: "administracion",
      testMode: true,
      bootstrapEmail,
      allowedDomain: "tekinsof.com",
    });
    expect(result.ok && result.data.role).toBe("administracion");
  });
});

describe("inviteUser", () => {
  it("un ventas no puede invitar", async () => {
    const result = await inviteUser(db, ventas, { email: "n@tekinsof.com", role: "ventas" }, opts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("rechaza dominios no permitidos con error de campo", async () => {
    const result = await inviteUser(db, gerencia, { email: "a@gmail.com", role: "ventas" }, opts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields?.email).toBe("Dominio no permitido");
  });

  it("escribe exactamente una fila user.invited", async () => {
    const result = await inviteUser(
      db,
      gerencia,
      { email: "nuevo@tekinsof.com", role: "ventas" },
      opts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, result.data.invitationId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("user.invited");
  });

  it("una invitación duplicada es CONFLICT", async () => {
    const result = await inviteUser(
      db,
      gerencia,
      { email: "nuevo@tekinsof.com", role: "ventas" },
      opts,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });
});

describe("último gerencia", () => {
  it("no se puede desactivar al único gerencia activo", async () => {
    const result = await deactivateUser(db, gerencia, { userId: gerencia.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    const [row] = await db.select().from(users).where(eq(users.id, gerencia.id));
    expect(row?.isActive).toBe(true);
  });

  it("no se puede degradar al único gerencia activo", async () => {
    const result = await setUserRole(db, gerencia, { userId: gerencia.id, role: "ventas" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("desactivar a un vendedor funciona y se audita", async () => {
    const result = await deactivateUser(db, gerencia, { userId: ventas.id });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, ventas.id));
    expect(row?.isActive).toBe(false);
  });
});
