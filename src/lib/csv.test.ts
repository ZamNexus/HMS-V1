import { describe, expect, it } from "vitest"
import { toCSV } from "./csv"

describe("toCSV", () => {
  it("joins headers and rows with commas and newlines", () => {
    expect(toCSV(["Date", "Amount"], [["2024-08-01", "500"], ["2024-08-02", "750"]])).toBe(
      "Date,Amount\n2024-08-01,500\n2024-08-02,750"
    )
  })

  it("quotes cells containing commas, quotes or newlines and doubles inner quotes", () => {
    expect(toCSV(["A"], [["Internet, phone"], ['Say "hi"'], ["two\nlines"]])).toBe(
      'A\n"Internet, phone"\n"Say ""hi"""\n"two\nlines"'
    )
  })

  it.each([
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "'\rcmd"],
  ])("neutralises formula-like cell %j", (input, expected) => {
    expect(toCSV(["X"], [[input]])).toBe(`X\n${expected}`)
  })

  it.each(["-500", "12.5", "0", "Ali Hassan", "Internet & phone bill"])("leaves %j unchanged", (value) => {
    expect(toCSV(["X"], [[value]])).toBe(`X\n${value}`)
  })

  it("neutralises header cells too", () => {
    expect(toCSV(["=cmd"], [])).toBe("'=cmd")
  })
})
