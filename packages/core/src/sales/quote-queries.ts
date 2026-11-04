import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";
import { companies, contacts, opportunities, quoteItems, quotes, users } from "../db/schema.ts";

// Read side of quotes: the list page and the full quote (editor and PDF).
const PAGE_SIZE = 25;

const listColumns = {
  id: quotes.id,
  number: quotes.number,
  version: quotes.version,
  status: quotes.status,
  currency: quotes.currency,
  totalCents: quotes.totalCents,
  validUntil: quotes.validUntil,
  createdAt: quotes.createdAt,
  opportunityTitle: opportunities.title,
  companyName: companies.name,
  ownerName: users.name,
};

export async function listQuotes(db: DbOrTx, opts: { status?: string; page?: number }) {
  const where = opts.status ? eq(quotes.status, opts.status) : undefined;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [rows, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(quotes)
      .innerJoin(opportunities, eq(quotes.opportunityId, opportunities.id))
      .leftJoin(companies, eq(quotes.companyId, companies.id))
      .leftJoin(users, eq(quotes.ownerId, users.id))
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(quotes).where(where),
  ]);
  return {
    rows,
    total: total?.n ?? 0,
    pageCount: Math.max(1, Math.ceil((total?.n ?? 0) / PAGE_SIZE)),
  };
}

export async function getQuote(db: DbOrTx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) return null;
  const [items, [opportunity], [company], [contact], [owner]] = await Promise.all([
    db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.sortOrder)),
    db.select().from(opportunities).where(eq(opportunities.id, quote.opportunityId)),
    quote.companyId ? db.select().from(companies).where(eq(companies.id, quote.companyId)) : [],
    quote.contactId ? db.select().from(contacts).where(eq(contacts.id, quote.contactId)) : [],
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        jobTitle: users.jobTitle,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, quote.ownerId)),
  ]);
  return {
    ...quote,
    items,
    opportunity: opportunity ?? null,
    company: company ?? null,
    contact: contact ?? null,
    owner: owner ?? null,
  };
}
