import { describe, expect, it } from "vitest";
import {
  comparisonLabel,
  presetRange,
  previousRange,
  rangeDays,
} from "../src/marketing/periods.ts";

// 2026-11-01 03:00 UTC is still 31 October in Lima (22:00).
const lateOctober = new Date("2026-11-01T03:00:00Z");
const midMarch = new Date("2026-03-15T15:00:00Z");

describe("periodos del dashboard", () => {
  it("calcula los accesos rápidos en días de Lima", () => {
    expect(presetRange("este-mes", lateOctober)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("mes-anterior", lateOctober)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("30-dias", lateOctober)).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(presetRange("90-dias", lateOctober)).toEqual({ from: "2026-08-03", to: "2026-10-31" });
    expect(presetRange("este-ano", lateOctober)).toEqual({ from: "2026-01-01", to: "2026-10-31" });
    expect(presetRange("mes-anterior", midMarch)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("compara un mes con el anterior y un mes en curso con los mismos días", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(previousRange({ from: "2026-10-01", to: "2026-10-15" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-15",
    });
    // 1–31 March compares with all of February; 1–30 March too (February has no 30th).
    expect(previousRange({ from: "2026-03-01", to: "2026-03-30" })).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(comparisonLabel({ from: "2026-09-01", to: "2026-09-15" })).toBe("vs. septiembre");
  });

  it("otros rangos se comparan con los mismos días inmediatamente antes", () => {
    const range = { from: "2026-10-02", to: "2026-10-31" };
    const previous = previousRange(range);
    expect(previous).toEqual({ from: "2026-09-02", to: "2026-10-01" });
    expect(rangeDays(previous)).toBe(rangeDays(range));
    expect(comparisonLabel(previous)).toBe("vs. periodo anterior");
  });
});
