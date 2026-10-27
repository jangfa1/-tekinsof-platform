import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import { requestSitePublish } from "../automation/sweeps.ts";
import type { DbOrTx } from "../db/client.ts";
import { services } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

export const serviceCategories = ["tecnologia", "marketing"] as const;
export const serviceUnits = ["servicio", "hora", "mes", "licencia", "proyecto"] as const;

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);

export const serviceInput = z.object({
  id: z.preprocess(blank, z.uuid().optional()),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, "Código inválido (p. ej. SW-DEV)"),
  name: z.string().trim().min(2, "Indica el nombre").max(120),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Usa minúsculas y guiones (p. ej. desarrollo-de-software)"),
  category: z.enum(serviceCategories, "Categoría inválida"),
  summary: z.string().trim().max(300).default(""),
  body: z.string().trim().max(10000).default(""),
  unit: z.enum(serviceUnits, "Unidad inválida").default("servicio"),
  basePriceCents: z.number().int().min(0).default(0),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(100),
  seoTitle: z.preprocess(blank, z.string().trim().max(70).optional()),
  seoDescription: z.preprocess(blank, z.string().trim().max(160).optional()),
});

export type Service = typeof services.$inferSelect;

export async function listServices(
  db: DbOrTx,
  opts: { activeOnly?: boolean; publishedOnly?: boolean } = {},
): Promise<Service[]> {
  return db
    .select()
    .from(services)
    .where(
      and(
        opts.activeOnly ? eq(services.isActive, true) : undefined,
        opts.publishedOnly ? eq(services.isPublished, true) : undefined,
      ),
    )
    .orderBy(asc(services.category), asc(services.sortOrder), asc(services.name));
}

export async function upsertService(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof serviceInput>,
): Promise<Result<{ serviceId: string }>> {
  if (!can(actor, "catalog.write")) return err("FORBIDDEN", "Sin permiso");
  const parsed = serviceInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { id, ...data } = parsed.data;
  const [clash] = await db
    .select({ id: services.id, slug: services.slug })
    .from(services)
    .where(
      and(
        or(eq(services.slug, data.slug), eq(services.code, data.code)),
        id ? sql`${services.id} <> ${id}` : undefined,
      ),
    )
    .limit(1);
  if (clash) {
    const field = clash.slug === data.slug ? "slug" : "code";
    return err("CONFLICT", "Ya existe un servicio con ese código o slug", {
      [field]: "Ya está en uso",
    });
  }
  return db.transaction(async (tx) => {
    const [row] = id
      ? await tx
          .update(services)
          .set(data)
          .where(eq(services.id, id))
          .returning({ id: services.id })
      : await tx.insert(services).values(data).returning({ id: services.id });
    if (!row) return err("NOT_FOUND", "Servicio no encontrado");
    await writeAudit(tx, {
      actorId: actor.id,
      action: id ? "service.updated" : "service.created",
      targetType: "service",
      targetId: row.id,
      metadata: { code: data.code, slug: data.slug },
    });
    return ok({ serviceId: row.id });
  });
}

// Publishing changes what the static site shows, so it also requests a site rebuild in the same
// transaction (site_publishes + outbox → site-deploy).
export async function setServicePublication(
  db: DbOrTx,
  actor: Actor,
  id: string,
  input: { isPublished: boolean; isFeatured: boolean },
): Promise<Result<{ serviceId: string; sitePublishId: string }>> {
  if (!can(actor, "catalog.write")) return err("FORBIDDEN", "Sin permiso");
  if (!z.uuid().safeParse(id).success) return err("NOT_FOUND", "Servicio no encontrado");
  const isPublished = input.isPublished === true;
  // A hidden service cannot be featured on the home page.
  const isFeatured = isPublished && input.isFeatured === true;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(services)
      .set({ isPublished, isFeatured })
      .where(eq(services.id, id))
      .returning({ id: services.id });
    if (!row) return err("NOT_FOUND", "Servicio no encontrado");
    const sitePublishId = await requestSitePublish(tx, {
      requestedBy: actor.id,
      reason: "catalogo",
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "service.publication_changed",
      targetType: "service",
      targetId: id,
      metadata: { isPublished, isFeatured },
    });
    return ok({ serviceId: id, sitePublishId });
  });
}
