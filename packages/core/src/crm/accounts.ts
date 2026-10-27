import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  ilike,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { writeAudit } from "../audit/audit.ts";
import { type Actor, can } from "../auth/permissions.ts";
import type { DbOrTx } from "../db/client.ts";
import { companies, contacts, opportunities } from "../db/schema.ts";
import { err, ok, type Result, validationError } from "../result.ts";

export const PAGE_SIZE = 25;

// Peruvian numbers to E.164: "987 654 321" → "+51987654321". Already-international numbers
// (+ and 8–15 digits) are kept; anything else is rejected with null.
export function normalizePhonePe(raw: string): string | null {
  const compact = raw.replace(/[\s\-()]/g, "");
  if (/^9\d{8}$/.test(compact)) return `+51${compact}`;
  if (/^519\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  return null;
}

const emptyToNull = (value: string | undefined) => value || null;
const optionalText = (max: number) => z.string().trim().max(max).optional().transform(emptyToNull);

export const companyInput = z.object({
  name: z.string().trim().min(2, "Indica el nombre").max(160),
  ruc: optionalText(20).refine(
    (value) => value === null || /^(10|15|16|17|20)\d{9}$/.test(value),
    "RUC inválido",
  ),
  industry: optionalText(120),
  website: optionalText(200),
  phone: optionalText(30),
  address: optionalText(240),
  ownerId: z.string().optional(),
});

const email = z.email("Correo inválido").nullable();

export const contactInput = z.object({
  companyId: optionalText(36).pipe(z.uuid().nullable()),
  fullName: z.string().trim().min(2, "Indica el nombre").max(160),
  email: z.string().trim().toLowerCase().optional().transform(emptyToNull).pipe(email),
  phone: optionalText(30),
  jobTitle: optionalText(120),
});

type AuditSpec = { action: string; targetType: string; metadata?: Record<string, unknown> };

// Runs a write and its audit row in one transaction; `write` returns the target id.
function audited(
  db: DbOrTx,
  actor: Actor,
  audit: AuditSpec,
  write: (tx: DbOrTx) => Promise<string | undefined>,
): Promise<Result<string>> {
  return db.transaction(async (tx) => {
    const targetId = await write(tx);
    if (!targetId) return err("INTERNAL", "No se pudo guardar");
    await writeAudit(tx, { actorId: actor.id, targetId, ...audit });
    return ok(targetId);
  });
}

async function rucTaken(db: DbOrTx, ruc: string, exceptId?: string): Promise<boolean> {
  const conditions = [eq(companies.ruc, ruc), isNull(companies.deletedAt)];
  if (exceptId) conditions.push(sql`${companies.id} <> ${exceptId}`);
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

export async function createCompany(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof companyInput>,
): Promise<Result<{ companyId: string }>> {
  if (!can(actor, "accounts.write")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = companyInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { ownerId, ...data } = parsed.data;
  if (data.ruc && (await rucTaken(db, data.ruc))) {
    return err("CONFLICT", "Ya existe una empresa con ese RUC", { ruc: "RUC ya registrado" });
  }
  const audit = { action: "company.created", targetType: "company", metadata: { name: data.name } };
  const saved = await audited(db, actor, audit, async (tx) => {
    const [row] = await tx
      .insert(companies)
      .values({ ...data, ownerId: ownerId || actor.id, createdBy: actor.id })
      .returning({ id: companies.id });
    return row?.id;
  });
  return saved.ok ? ok({ companyId: saved.data }) : saved;
}

export async function updateCompany(
  db: DbOrTx,
  actor: Actor,
  id: string,
  input: z.input<typeof companyInput>,
): Promise<Result<{ companyId: string }>> {
  if (!can(actor, "accounts.write")) return err("FORBIDDEN", "No tienes permiso");
  const parsed = companyInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { ownerId, ...data } = parsed.data;
  const existing = await getCompanyRow(db, id);
  if (!existing) return err("NOT_FOUND", "Empresa no encontrada");
  if (data.ruc && (await rucTaken(db, data.ruc, id))) {
    return err("CONFLICT", "Ya existe una empresa con ese RUC", { ruc: "RUC ya registrado" });
  }
  const audit = { action: "company.updated", targetType: "company", metadata: { after: data } };
  const saved = await audited(db, actor, audit, async (tx) => {
    await tx
      .update(companies)
      .set({ ...data, ...(ownerId ? { ownerId } : {}) })
      .where(eq(companies.id, id));
    return id;
  });
  return saved.ok ? ok({ companyId: id }) : saved;
}

export async function softDeleteCompany(
  db: DbOrTx,
  actor: Actor,
  id: string,
): Promise<Result<{ companyId: string }>> {
  if (!can(actor, "accounts.write")) return err("FORBIDDEN", "No tienes permiso");
  const existing = await getCompanyRow(db, id);
  if (!existing) return err("NOT_FOUND", "Empresa no encontrada");
  const audit = { action: "company.deleted", targetType: "company" };
  const saved = await audited(db, actor, audit, async (tx) => {
    await tx.update(companies).set({ deletedAt: new Date() }).where(eq(companies.id, id));
    return id;
  });
  return saved.ok ? ok({ companyId: id }) : saved;
}

async function prepareContact(
  db: DbOrTx,
  input: z.input<typeof contactInput>,
  exceptId?: string,
): Promise<Result<z.output<typeof contactInput>>> {
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = { ...parsed.data };
  if (data.phone) {
    const phone = normalizePhonePe(data.phone);
    if (!phone) return err("VALIDATION_ERROR", "Datos inválidos", { phone: "Teléfono inválido" });
    data.phone = phone;
  }
  if (data.email) {
    const conditions = [sql`lower(${contacts.email}) = ${data.email}`, isNull(contacts.deletedAt)];
    if (exceptId) conditions.push(sql`${contacts.id} <> ${exceptId}`);
    const [dup] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(...conditions))
      .limit(1);
    if (dup) return err("CONFLICT", "Contacto duplicado", { email: "Correo ya registrado" });
  }
  return ok(data);
}

export async function createContact(
  db: DbOrTx,
  actor: Actor,
  input: z.input<typeof contactInput>,
): Promise<Result<{ contactId: string }>> {
  if (!can(actor, "accounts.write")) return err("FORBIDDEN", "No tienes permiso");
  const prepared = await prepareContact(db, input);
  if (!prepared.ok) return prepared;
  const audit = { action: "contact.created", targetType: "contact" };
  const saved = await audited(db, actor, audit, async (tx) => {
    const [row] = await tx
      .insert(contacts)
      .values({ ...prepared.data, ownerId: actor.id })
      .returning({ id: contacts.id });
    return row?.id;
  });
  return saved.ok ? ok({ contactId: saved.data }) : saved;
}

export async function updateContact(
  db: DbOrTx,
  actor: Actor,
  id: string,
  input: z.input<typeof contactInput>,
): Promise<Result<{ contactId: string }>> {
  if (!can(actor, "accounts.write")) return err("FORBIDDEN", "No tienes permiso");
  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
  if (!existing) return err("NOT_FOUND", "Contacto no encontrado");
  const prepared = await prepareContact(db, input, id);
  if (!prepared.ok) return prepared;
  const audit = { action: "contact.updated", targetType: "contact" };
  const saved = await audited(db, actor, audit, async (tx) => {
    await tx.update(contacts).set(prepared.data).where(eq(contacts.id, id));
    return id;
  });
  return saved.ok ? ok({ contactId: id }) : saved;
}

function paged<T>(rows: T[], total = 0) {
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

function pageOffset(page: number | undefined): number {
  return (Math.max(1, Math.floor(page ?? 1)) - 1) * PAGE_SIZE;
}

export async function listCompanies(db: DbOrTx, opts: { q?: string; page?: number }) {
  const where = and(
    isNull(companies.deletedAt),
    opts.q
      ? or(ilike(companies.name, `%${opts.q}%`), ilike(companies.ruc, `%${opts.q}%`))
      : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(companies)
      .where(where)
      .orderBy(asc(companies.name))
      .limit(PAGE_SIZE)
      .offset(pageOffset(opts.page)),
    db.select({ n: count() }).from(companies).where(where),
  ]);
  return paged(rows, total?.n);
}

async function getCompanyRow(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1);
  return row;
}

export async function getCompany(db: DbOrTx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const company = await getCompanyRow(db, id);
  if (!company) return null;
  const [companyContacts, openOpportunities] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, id), isNull(contacts.deletedAt)))
      .orderBy(asc(contacts.fullName)),
    db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.companyId, id),
          isNull(opportunities.deletedAt),
          notInArray(opportunities.stage, ["ganada", "perdida"]),
        ),
      )
      .orderBy(asc(opportunities.createdAt)),
  ]);
  return { ...company, contacts: companyContacts, openOpportunities };
}

export async function listContacts(db: DbOrTx, opts: { q?: string; page?: number }) {
  const where = and(
    isNull(contacts.deletedAt),
    opts.q
      ? or(ilike(contacts.fullName, `%${opts.q}%`), ilike(contacts.email, `%${opts.q}%`))
      : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({ ...getTableColumns(contacts), companyName: companies.name })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(where)
      .orderBy(asc(contacts.fullName))
      .limit(PAGE_SIZE)
      .offset(pageOffset(opts.page)),
    db.select({ n: count() }).from(contacts).where(where),
  ]);
  return paged(rows, total?.n);
}
