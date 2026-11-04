import {
  itemTypeLabels,
  type QuoteItemType,
  type QuoteSection,
  typesBySection,
} from "@tekinsof/core/sales/quote-document";
import { formatAmount } from "@tekinsof/core/sales/quote-math";
import { Button, Input, Select } from "@/components/ui";

// One editable (or read-only) table per section of the quote. Rows share one index space in the
// form (`items.<index>.*`): products first, then services, so the action rebuilds the order.

export type ItemRow = {
  id: string;
  serviceId: string | null;
  section: string;
  itemType: string;
  partNumber: string | null;
  description: string;
  quantity: string;
  unitPriceCents: number;
  lineTotalCents: number;
};

type Props = {
  section: QuoteSection;
  rows: Array<ItemRow | undefined>;
  firstIndex: number;
  editable: boolean;
  catalog: Array<{ id: string; name: string }>;
  money: (cents: number) => string;
  subtotalCents: number;
};

const cell = "border-t border-border px-2 py-2 align-top";
const noun = { producto: "producto", servicio: "servicio" } as const;

export function ItemsSection(props: Props) {
  const { section, rows, firstIndex, editable, catalog, money, subtotalCents } = props;
  const isProduct = section === "producto";
  const columns = [
    ...(isProduct ? ["Tipo", "Part number"] : ["Catálogo", "Tipo de servicio"]),
    "Descripción",
    "Cantidad",
    "Precio unitario",
    "Total",
    ...(editable ? [""] : []),
  ];
  const label = (field: string, n: number) => `${field} del ${noun[section]} ${n}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{isProduct ? "Productos" : "Servicios"}</caption>
        <thead className="bg-surface text-left text-fg-muted">
          <tr>
            {columns.map((title, i) => (
              <th key={title || `c${i}`} scope="col" className="px-2 py-2 font-medium">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${cell} text-fg-muted`}>
                {isProduct ? "Sin productos" : "Sin servicios"}
              </td>
            </tr>
          ) : null}
          {rows.map((item, offset) => {
            const i = firstIndex + offset;
            const n = offset + 1;
            const name = (field: string) => `items.${i}.${field}`;
            const typeLabel = itemTypeLabels[item?.itemType as QuoteItemType] ?? "—";
            const price = item ? formatAmount(item.unitPriceCents).replaceAll(",", "") : "";
            const text = (field: string, title: string, value: string, numeric = false) =>
              editable ? (
                <>
                  <label htmlFor={`${field}${i}`} className="sr-only">
                    {label(title, n)}
                  </label>
                  <Input
                    id={`${field}${i}`}
                    name={name(field)}
                    defaultValue={value}
                    inputMode={numeric ? "decimal" : "text"}
                  />
                </>
              ) : (
                <span className={numeric ? "tabular-nums" : ""}>{value || "—"}</span>
              );
            return (
              <tr key={item?.id ?? `new-${i}`}>
                {isProduct ? null : (
                  <td className={cell}>
                    {editable ? (
                      <>
                        <label htmlFor={`svc${i}`} className="sr-only">
                          {label("Catálogo", n)}
                        </label>
                        <Select
                          id={`svc${i}`}
                          name={name("serviceId")}
                          defaultValue={item?.serviceId ?? ""}
                        >
                          <option value="">Concepto libre</option>
                          {catalog.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </>
                    ) : item?.serviceId ? (
                      "Catálogo"
                    ) : (
                      "Concepto libre"
                    )}
                  </td>
                )}
                <td className={cell}>
                  {editable ? (
                    <>
                      <input type="hidden" name={name("section")} value={section} />
                      <label htmlFor={`type${i}`} className="sr-only">
                        {label("Tipo", n)}
                      </label>
                      <Select
                        id={`type${i}`}
                        name={name("itemType")}
                        defaultValue={item?.itemType ?? typesBySection[section][0]}
                      >
                        {typesBySection[section].map((type) => (
                          <option key={type} value={type}>
                            {itemTypeLabels[type]}
                          </option>
                        ))}
                      </Select>
                    </>
                  ) : (
                    typeLabel
                  )}
                </td>
                {isProduct ? (
                  <td className={cell}>
                    {text("partNumber", "Part number", item?.partNumber ?? "")}
                  </td>
                ) : null}
                <td className={cell}>
                  {text("description", "Descripción", item?.description ?? "")}
                </td>
                <td className={cell}>
                  {text("quantity", "Cantidad", item?.quantity ?? "1", true)}
                </td>
                <td className={cell}>{text("price", "Precio unitario", price, true)}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {item ? money(item.lineTotalCents) : "—"}
                </td>
                {editable ? (
                  <td className={cell}>
                    <Button
                      type="submit"
                      name="op"
                      value={`remove:${i}`}
                      variant="ghost"
                      aria-label={`Quitar ${noun[section]} ${n}`}
                    >
                      Quitar
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              colSpan={columns.length - (editable ? 2 : 1)}
              className="border-t border-fg px-2 py-2 text-right font-semibold"
            >
              {isProduct ? "Subtotal productos" : "Subtotal servicios"}
            </th>
            <td className="border-t border-fg px-2 py-2 text-right font-semibold tabular-nums">
              {money(subtotalCents)}
            </td>
            {editable ? <td className="border-t border-fg" /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
