import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const STATUS_STYLES: Record<string, string> = {
  active: "bg-success-100 text-success-700",
  paid: "bg-success-100 text-success-700",
  completed: "bg-success-100 text-success-700",
  delivered: "bg-slate-200 text-slate-700",
  discharged: "bg-success-100 text-success-700",
  recovered: "bg-success-100 text-success-700",
  improved: "bg-success-100 text-success-700",
  "in stock": "bg-success-100 text-success-700",

  ipd: "bg-teal-100 text-teal-700",
  "ipd admitted": "bg-teal-100 text-teal-700",
  "in progress": "bg-teal-100 text-teal-700",
  collected: "bg-blue-100 text-blue-700",

  pending: "bg-warning-100 text-warning-700",
  partial: "bg-warning-100 text-warning-700",
  waiting: "bg-warning-100 text-warning-700",
  scheduled: "bg-slate-200 text-slate-700",
  open: "bg-warning-100 text-warning-700",
  "low stock": "bg-warning-100 text-warning-700",
  "expiring soon": "bg-orange-100 text-orange-700",

  inactive: "bg-slate-200 text-slate-500",
  cancelled: "bg-danger-100 text-danger-700",
  unpaid: "bg-danger-100 text-danger-700",
  "out of stock": "bg-danger-100 text-danger-700",
  expired: "bg-danger-100 text-danger-700",
  critical: "bg-danger-100 text-danger-700",
  urgent: "bg-danger-100 text-danger-700",

  normal: "bg-slate-100 text-slate-600",
  high: "bg-danger-100 text-danger-700",
  low: "bg-blue-100 text-blue-700",
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase()
  const style = STATUS_STYLES[key] ?? "bg-slate-100 text-slate-600"
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", style, className)}>
      {status}
    </Badge>
  )
}
