import { describe, expect, it } from "vitest";
import { parseIsoDuration } from "@/server/providers/duration";

describe("parseIsoDuration", () => {
  it("parses minutes and seconds", () => {
    expect(parseIsoDuration("PT3M20S")).toBe(200000);
  });

  it("parses hours", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723000);
  });

  it("parses seconds only", () => {
    expect(parseIsoDuration("PT45S")).toBe(45000);
  });

  it("parses minutes only", () => {
    expect(parseIsoDuration("PT4M")).toBe(240000);
  });

  it("handles fractional seconds", () => {
    expect(parseIsoDuration("PT3M5.5S")).toBe(185500);
  });

  it("returns undefined for garbage or missing input", () => {
    expect(parseIsoDuration("3:20")).toBeUndefined();
    expect(parseIsoDuration(undefined)).toBeUndefined();
    expect(parseIsoDuration("")).toBeUndefined();
  });
});
