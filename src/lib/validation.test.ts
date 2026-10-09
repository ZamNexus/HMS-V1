import { describe, expect, it } from "vitest"
import { failedChecks, validationToast } from "./validation"

describe("failedChecks", () => {
  it("returns the messages of falsy checks, in order", () => {
    expect(failedChecks([["", "Name is required"], ["X1", "Code is required"], [0, "Fee is required"], [NaN, "Amount is invalid"]]))
      .toEqual(["Name is required", "Fee is required", "Amount is invalid"])
  })

  it("returns nothing when every check passes", () => {
    expect(failedChecks([["Ali", "Name is required"], [500, "Fee is required"], [true, "Amount must be greater than 0"]])).toEqual([])
  })
})

describe("validationToast", () => {
  it("uses a singular title for one problem", () => {
    expect(validationToast(["Name is required"])).toEqual({ variant: "destructive", title: "Please fix this field", description: "Name is required" })
  })

  it("uses a plural title and joins several problems", () => {
    expect(validationToast(["Name is required", "Fee is required"])).toMatchObject({ title: "Please fix these fields", description: "Name is required · Fee is required" })
  })
})
