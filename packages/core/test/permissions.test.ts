import { describe, expect, it } from "vitest";
import { type Actor, can, isRole } from "../src/auth/permissions.ts";

const actor = (role: Actor["role"], id = "u1"): Actor => ({
  id,
  email: `${id}@tekinsof.com`,
  role,
});

describe("can", () => {
  it("ventas actualiza solo sus propios leads", () => {
    const ventas = actor("ventas");
    expect(can(ventas, "leads.update_own", { ownerId: ventas.id })).toBe(true);
    expect(can(ventas, "leads.update_own", { ownerId: "otro" })).toBe(false);
    expect(can(ventas, "leads.update_own")).toBe(false);
  });

  it("gerencia aprueba y actualiza recursos ajenos vía _any", () => {
    const gerencia = actor("gerencia");
    expect(can(gerencia, "quotes.approve")).toBe(true);
    expect(can(gerencia, "leads.update_own", { ownerId: "otro" })).toBe(true);
  });

  it("marketing no cotiza", () => {
    expect(can(actor("marketing"), "quotes.write_own", { ownerId: "u1" })).toBe(false);
  });

  it("administracion no crea leads", () => {
    expect(can(actor("administracion"), "leads.create")).toBe(false);
  });
});

describe("isRole", () => {
  it("rechaza roles desconocidos", () => {
    expect(isRole("admin")).toBe(false);
    expect(isRole("ventas")).toBe(true);
  });
});
