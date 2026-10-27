import { describe, expect, it } from "vitest";
import {
  computeQuoteTotals,
  formatAmount,
  lineTotalCents,
  requiresApproval,
} from "../src/sales/quote-math.ts";

describe("computeQuoteTotals", () => {
  it("un ítem sin descuento", () => {
    expect(computeQuoteTotals([{ quantity: "1", unitPriceCents: 100000 }], "0")).toEqual({
      subtotalCents: 100000,
      discountCents: 0,
      igvCents: 18000,
      totalCents: 118000,
    });
  });

  it("cantidades decimales y 10% de descuento", () => {
    expect(
      computeQuoteTotals(
        [
          { quantity: "2.5", unitPriceCents: 19999 },
          { quantity: "1", unitPriceCents: 150000 },
        ],
        "10",
      ),
    ).toEqual({ subtotalCents: 199998, discountCents: 20000, igvCents: 32400, totalCents: 212398 });
  });

  it("15% de descuento", () => {
    expect(computeQuoteTotals([{ quantity: "1", unitPriceCents: 100000 }], "15")).toEqual({
      subtotalCents: 100000,
      discountCents: 15000,
      igvCents: 15300,
      totalCents: 100300,
    });
  });
});

describe("reglas auxiliares", () => {
  it("redondea medio céntimo hacia arriba", () => {
    expect(lineTotalCents({ quantity: "0.5", unitPriceCents: 333 })).toBe(167);
  });

  it("aprobación solo por encima de 10%", () => {
    expect(requiresApproval("10.00")).toBe(false);
    expect(requiresApproval("10.01")).toBe(true);
  });

  it("formatea montos peruanos", () => {
    expect(formatAmount(123456789)).toBe("1,234,567.89");
    expect(formatAmount(5)).toBe("0.05");
  });

  it("rechaza más de dos decimales", () => {
    expect(() => lineTotalCents({ quantity: "1.234", unitPriceCents: 1 })).toThrow(Error);
  });
});
