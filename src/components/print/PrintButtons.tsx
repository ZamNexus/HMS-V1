"use client"
import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PAPER_LABEL, printDocument, type Paper } from "@/lib/print"

/**
 * The print buttons of a printable view. One paper shows a plain "Print"; several (a receipt or a dispense slip: A4 and an 80 mm roll) show one button each.
 * The first is the primary action. Hidden when printing (no-print), like every control.
 */
export function PrintButtons({ papers = ["a4"], onClose }: { papers?: readonly Paper[]; onClose: () => void }) {
  return (
    <div className="no-print flex flex-wrap justify-end gap-2">
      <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Close</Button>
      {papers.map((p, i) => (
        <Button key={p} variant={i === 0 ? "default" : "outline"} data-testid={`print-${p}`} className={i === 0 ? "rounded-xl bg-[#0F2A4D] font-bold text-white hover:bg-[#16375F]" : "rounded-xl font-bold"} onClick={() => printDocument(p)}>
          <Printer className="mr-2 h-4 w-4" /> {papers.length === 1 ? "Print" : `Print ${PAPER_LABEL[p]}`}
        </Button>
      ))}
    </div>
  )
}
