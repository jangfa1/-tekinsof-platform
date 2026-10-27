import { describe, expect, it } from "vitest";
import { addBusinessHours, isBusinessDay, limaDate } from "../src/time/business-hours.ts";

const none = new Set<string>();

// Blueprint step 12 vectors: start (UTC), holidays, expected (UTC). Lima = UTC−05:00.
const vectors: Array<[string, ReadonlySet<string>, string]> = [
  ["2026-11-02T15:00:00.000Z", none, "2026-11-02T19:00:00.000Z"], // lun 10:00
  ["2026-11-02T21:30:00.000Z", none, "2026-11-03T16:30:00.000Z"], // lun 16:30
  ["2026-11-06T22:00:00.000Z", none, "2026-11-09T17:00:00.000Z"], // vie 17:00
  ["2026-11-07T16:00:00.000Z", none, "2026-11-09T18:00:00.000Z"], // sáb 11:00
  ["2026-12-07T22:00:00.000Z", new Set(["2026-12-08", "2026-12-09"]), "2026-12-10T17:00:00.000Z"],
  ["2026-11-02T12:00:00.000Z", none, "2026-11-02T18:00:00.000Z"], // lun 07:00
  ["2026-11-02T23:30:00.000Z", none, "2026-11-03T18:00:00.000Z"], // lun 18:30
];

describe("addBusinessHours", () => {
  it.each(vectors)("4 h laborables desde %s", (start, holidays, expected) => {
    expect(addBusinessHours(new Date(start), 4, holidays).toISOString()).toBe(expected);
  });
});

describe("calendario de Lima", () => {
  it("limaDate usa el día de Lima", () => {
    expect(limaDate(new Date("2026-11-03T03:00:00.000Z"))).toBe("2026-11-02");
  });

  it("el sábado no es día laborable", () => {
    expect(isBusinessDay("2026-11-07", new Set())).toBe(false);
  });
});
