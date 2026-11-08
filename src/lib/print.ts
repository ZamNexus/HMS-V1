// Printing (Phase 12, G1): no PDF library. A view that can be printed wraps its content in an element with the class `print-root`; the print rules in globals.css then show that element
// alone, un-clipped (a dialog is fixed, centred with a transform and scrolls, which would cut a long report at the window's edge). The PAPER is chosen at the moment of printing:
// `@page` cannot depend on an attribute, so a style element with the right rule is added just before window.print() and removed after.

export type Paper = "a4" | "thermal" | "label"
export const PAPER_LABEL: Record<Paper, string> = { a4: "A4", thermal: "80 mm receipt", label: "Tube label" }
export const PRINT_ROOT_CLASS = "print-root"

/** The default length of a thermal page when the content cannot be measured. */
export const THERMAL_DEFAULT_MM = 200

/**
 * The @page rule of each paper. A4 with 12 mm margins; a specimen-tube label of 50 x 25 mm; a thermal roll 80 mm wide with 3 mm margins. A browser needs a real length for a page
 * ("size: 80mm auto" is ignored and the page falls back to Letter), so a roll page is as long as the content measured at roll width (the printer driver cuts the roll there).
 */
export function pageCss(paper: Paper, contentMm: number = THERMAL_DEFAULT_MM): string {
  switch (paper) {
    case "a4": return "@page { size: A4; margin: 12mm; }"
    case "thermal": return `@page { size: 80mm ${Math.max(40, Math.ceil(contentMm))}mm; margin: 3mm; }`
    case "label": return "@page { size: 50mm 25mm; margin: 1.5mm; }"
  }
}

const MM_PER_PX = 25.4 / 96

/** How tall (mm) the printable view will be on a roll: a copy of it is laid out off-screen at the roll's width (the real print rules only apply while printing). */
function measureThermalMm(): number {
  const root = document.querySelector("." + PRINT_ROOT_CLASS)
  if (!root) return THERMAL_DEFAULT_MM
  const probe = root.cloneNode(true) as HTMLElement
  probe.classList.add("print-probe-thermal")
  probe.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;"
  document.body.appendChild(probe)
  const heightMm = probe.getBoundingClientRect().height * MM_PER_PX
  probe.remove()
  return heightMm + 6 /* the two 3 mm margins */ + 2 /* slack: a printer rounds up */
}

/** Prints the current page on the given paper. Cleans up after the print dialog closes (or after a minute where the browser never reports it). */
export function printDocument(paper: Paper = "a4"): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const style = document.createElement("style")
  style.setAttribute("data-hms-page", paper)
  style.textContent = pageCss(paper, paper === "thermal" ? measureThermalMm() : undefined)
  document.head.appendChild(style)
  root.setAttribute("data-paper", paper)
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    style.remove()
    root.removeAttribute("data-paper")
    window.removeEventListener("afterprint", cleanup)
  }
  window.addEventListener("afterprint", cleanup)
  window.setTimeout(cleanup, 60_000)
  window.print()
}
