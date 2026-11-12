import { describe, expect, test } from "bun:test";
import { dateLabel, defaultForecastRange, parseEuroInput } from "./api";
describe("UI financial boundaries", () => {
  test("preserves every cent at the safe integer boundary", () => {
    expect(parseEuroInput("90071992547409,91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseEuroInput("-0,01")).toBe(-1);
    expect(parseEuroInput("1.250,10")).toBe(125010);
    expect(() => parseEuroInput("90071992547409.92")).toThrow();
    expect(() => parseEuroInput("12,345")).toThrow();
    expect(() => parseEuroInput("NaN")).toThrow();
  });
  test("never starts a forecast before an active account snapshot", () => {
    expect(
      defaultForecastRange(
        [{ asOfDate: "2026-10-31", enabled: true }],
        "2026-11-12",
      ),
    ).toEqual({ from: "2026-11-01", to: "2027-04-30" });
    expect(
      defaultForecastRange(
        [{ asOfDate: "2026-11-12", enabled: true }],
        "2026-11-12",
      ).from,
    ).toBe("2026-11-13");
    expect(
      defaultForecastRange(
        [
          { asOfDate: "2026-10-31", enabled: true },
          { asOfDate: "2026-11-20", enabled: false },
        ],
        "2026-11-12",
      ).from,
    ).toBe("2026-11-01");
  });
  test("handles leap-day snapshots and calendar labels without host time-zone shifts", () => {
    expect(
      defaultForecastRange(
        [{ asOfDate: "2028-02-29", enabled: true }],
        "2028-02-29",
      ).from,
    ).toBe("2028-03-01");
    const old = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati";
      expect(
        dateLabel("2026-11-12", {
          day: "numeric",
          month: "numeric",
          year: "numeric",
        }),
      ).toBe("12/11/2026");
    } finally {
      process.env.TZ = old;
    }
  });
});
