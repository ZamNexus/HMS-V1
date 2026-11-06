import { describe, expect, it } from "vitest"
import { formatMoney, isUlid, parseMoney } from "./convert"

describe("isUlid", () => {
  it("accepts a 26-char Crockford base32 string", () => {
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true)
  })
  it("rejects wrong length, forbidden letters (I L O U), lowercase and non-strings", () => {
    for (const bad of ["01ARZ3NDEKTSV4RRFFQ69G5FA", "01ARZ3NDEKTSV4RRFFQ69G5FAVV", "01ARZ3NDEKTSV4RRFFQ69G5FAI", "01arz3ndektsv4rrffq69g5fav", 12, null, undefined]) {
      expect(isUlid(bad)).toBe(false)
    }
  })
})

describe("money conversion", () => {
  it("parses decimal strings", () => {
    expect(parseMoney("1500.00")).toBe(1500)
    expect(parseMoney("0.5")).toBe(0.5)
    expect(parseMoney("-20")).toBe(-20)
  })
  it("rejects numbers and malformed strings instead of producing NaN", () => {
    for (const bad of [1500, "", "abc", "1,500.00", "1e3", " 1500", null, undefined]) {
      expect(() => parseMoney(bad)).toThrow(TypeError)
    }
  })
  it("formats with two decimals and round-trips", () => {
    expect(formatMoney(1500)).toBe("1500.00")
    expect(formatMoney(12.5)).toBe("12.50")
    expect(parseMoney(formatMoney(799.99))).toBe(799.99)
    expect(() => formatMoney(NaN)).toThrow(TypeError)
  })
})
