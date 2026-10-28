import { can } from "@tekinsof/core/auth/permissions";
import {
  type BlockType,
  blockSchema,
  blockTypes,
  defaultBlock,
  formFields,
} from "@tekinsof/core/cms/block-schema";
import { Block } from "@tekinsof/core/cms/blocks";
import {
  archiveLanding,
  getLanding,
  listCampaigns,
  publishLanding,
  saveLanding,
} from "@tekinsof/core/cms/landings";
import { getDb } from "@tekinsof/core/db/client";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { authorize, requirePermissionPage } from "@/lib/actor";
import {
  display,
  fieldLabels,
  fieldsByType,
  type Raw,
  readBlock,
  str,
  typeLabels,
} from "@/lib/landing-form";

export const metadata: Metadata = { title: "Editor de landing" };

function back(id: string, params: Record<string, string>): never {
  redirect(`/landings/${id}?${new URLSearchParams(params).toString()}`);
}

async function save(formData: FormData) {
  "use server";
  const id = str(formData, "id");
  const op = str(formData, "op");
  const actor = await authorize("landings.write");
  if (!actor.ok) back(id, { error: actor.error.message });
  const blocks = Array.from({ length: Number(formData.get("count")) }, (_, i) =>
    readBlock(formData, i),
  );
  const [verb, at] = op.split(":");
  const i = Number(at);
  if (verb === "remove") blocks.splice(i, 1);
  if ((verb === "up" && i > 0) || (verb === "down" && i < blocks.length - 1)) {
    const j = verb === "up" ? i - 1 : i + 1;
    [blocks[i], blocks[j]] = [blocks[j] as Raw, blocks[i] as Raw];
  }
  if (verb === "add") blocks.push(defaultBlock(str(formData, "newType") as BlockType));
  const saved = await saveLanding(getDb(), actor.data, {
    id,
    title: str(formData, "title"),
    slug: str(formData, "slug"),
    campaignId: str(formData, "campaignId"),
    seoTitle: str(formData, "seoTitle"),
    seoDescription: str(formData, "seoDescription"),
    whatsappMessage: str(formData, "whatsappMessage"),
    blocks: blocks as never,
  });
  if (!saved.ok) {
    const params: Record<string, string> = { error: saved.error.message };
    for (const [field, message] of Object.entries(saved.error.fields ?? {}))
      params[`e_${field}`] = message;
    back(id, params);
  }
  if (verb === "publish" || verb === "archive") {
    const changed = await (verb === "publish" ? publishLanding : archiveLanding)(
      getDb(),
      actor.data,
      id,
    );
    if (!changed.ok) back(id, { error: changed.error.message });
    back(id, {
      ok:
        verb === "publish"
          ? "Publicada: el sitio se regenerará en unos minutos"
          : "Landing archivada",
    });
  }
  back(id, { ok: "Cambios guardados" });
}

export default async function LandingEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePermissionPage("landings.write");
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const [landing, campaignRows] = await Promise.all([getLanding(db, id), listCampaigns(db)]);
  if (!landing) notFound();
  const blocks = (Array.isArray(landing.blocks) ? landing.blocks : []) as Raw[];
  const errorFor = (prefix: string) =>
    Object.entries(query).find(
      ([key]) => key === `e_${prefix}` || key.startsWith(`e_${prefix}.`),
    )?.[1];
  const canPublish = can(actor, "landings.publish");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">{landing.title}</h1>
        <Badge tone={landing.status === "publicada" ? "success" : "neutral"}>
          {landing.status}
        </Badge>
        <span className="font-mono text-sm text-fg-muted">/lp/{landing.slug}</span>
      </div>
      <p
        aria-live="polite"
        role={query.error ? "alert" : "status"}
        className={`text-sm ${query.error ? "text-destructive" : "text-success"}`}
      >
        {query.error ?? query.ok}
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <form action={save} className="space-y-4">
          <input type="hidden" name="id" value={landing.id} />
          <input type="hidden" name="count" value={blocks.length} />
          <Card title="Datos">
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="title" label="Título interno" error={errorFor("title")}>
                <Input name="title" defaultValue={landing.title} required />
              </Field>
              <Field id="slug" label="Slug" error={errorFor("slug")}>
                <Input name="slug" defaultValue={landing.slug} required />
              </Field>
              <Field id="campaignId" label="Campaña">
                <Select name="campaignId" defaultValue={landing.campaignId ?? ""}>
                  <option value="">Sin campaña</option>
                  {campaignRows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="whatsappMessage" label="Mensaje de WhatsApp">
                <Input name="whatsappMessage" defaultValue={landing.whatsappMessage ?? ""} />
              </Field>
              <Field id="seoTitle" label="Título SEO" error={errorFor("seoTitle")}>
                <Input name="seoTitle" defaultValue={landing.seoTitle ?? ""} />
              </Field>
              <Field id="seoDescription" label="Descripción SEO" error={errorFor("seoDescription")}>
                <Input name="seoDescription" defaultValue={landing.seoDescription ?? ""} />
              </Field>
            </div>
          </Card>

          {blocks.map((block, i) => {
            const type = block.type as BlockType;
            return (
              <fieldset
                // biome-ignore lint/suspicious/noArrayIndexKey: block order is the identity here
                key={i}
                className="space-y-3 rounded-[var(--radius-card)] border border-border p-4"
              >
                <legend className="px-1 font-display font-semibold">{`${i + 1}. ${typeLabels[type] ?? type}`}</legend>
                <input type="hidden" name={`blocks.${i}.type`} value={type} />
                {(fieldsByType[type] ?? []).map((def) => {
                  const fid = `b${i}-${def.name}`;
                  const name = `blocks.${i}.${def.name}`;
                  const error = errorFor(name);
                  if (def.kind === "fields") {
                    const chosen = (block.fields as string[] | undefined) ?? [];
                    return (
                      <fieldset key={def.name}>
                        <legend className="text-sm font-medium">{def.label}</legend>
                        <div className="mt-1 flex flex-wrap gap-4">
                          {formFields.map((f) => (
                            <label key={f} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                name={name}
                                value={f}
                                defaultChecked={chosen.includes(f)}
                                className="size-4"
                              />
                              {fieldLabels[f]}
                            </label>
                          ))}
                        </div>
                        {error ? (
                          <p role="alert" className="mt-1 text-sm text-destructive">
                            {error}
                          </p>
                        ) : null}
                      </fieldset>
                    );
                  }
                  return (
                    <Field key={def.name} id={fid} label={def.label} help={def.help} error={error}>
                      {def.kind === "target" ? (
                        <Select name={name} defaultValue={display(block, def)}>
                          <option value="form">Ir al formulario</option>
                          <option value="whatsapp">Abrir WhatsApp</option>
                          <option value="bookings">Agendar reunión</option>
                        </Select>
                      ) : def.kind === "text" ? (
                        <Input name={name} defaultValue={display(block, def)} />
                      ) : (
                        <Textarea name={name} defaultValue={display(block, def)} />
                      )}
                    </Field>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  {[
                    ["up", "Subir"],
                    ["down", "Bajar"],
                    ["remove", "Quitar"],
                  ].map(([verb, label]) => (
                    <Button
                      key={verb}
                      type="submit"
                      name="op"
                      value={`${verb}:${i}`}
                      variant="ghost"
                      aria-label={`${label} bloque ${i + 1}`}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </fieldset>
            );
          })}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="newType" className="block text-sm font-medium">
                Tipo de bloque
              </label>
              <Select id="newType" name="newType" defaultValue="benefits">
                {blockTypes.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" name="op" value="add" variant="ghost">
              Agregar bloque
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="op" value="save">
              Guardar
            </Button>
            {canPublish ? (
              <>
                <Button type="submit" name="op" value="publish" variant="accent">
                  Publicar
                </Button>
                <Button type="submit" name="op" value="archive" variant="ghost">
                  Archivar
                </Button>
              </>
            ) : null}
          </div>
        </form>

        <section
          aria-label="Vista previa"
          className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-background"
        >
          <p className="border-b border-border bg-surface px-4 py-2 text-sm text-fg-muted">
            Vista previa
          </p>
          {blocks.map((raw, i) => {
            const parsed = blockSchema.safeParse(raw);
            // biome-ignore lint/suspicious/noArrayIndexKey: block order is the identity here
            return parsed.success ? <Block key={i} block={parsed.data} preview /> : null;
          })}
        </section>
      </div>
    </div>
  );
}
