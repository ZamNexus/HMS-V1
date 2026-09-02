import { Construction } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Construction className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <Badge variant="secondary">Module coming soon</Badge>
    </div>
  )
}
