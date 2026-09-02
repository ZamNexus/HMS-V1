import * as React from "react"
import { Camera, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

const MAX_BYTES = 2 * 1024 * 1024

export function PhotoUpload({
  value,
  onChange,
  label = "Profile Photo",
}: {
  value?: string
  onChange: (dataUrl: string | undefined) => void
  label?: string
}) {
  const { toast } = useToast()
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast({ variant: "destructive", title: "Invalid file", description: "Only JPG or PNG images are accepted." })
      return
    }
    if (file.size > MAX_BYTES) {
      toast({ variant: "destructive", title: "File too large", description: "Maximum size is 2 MB." })
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/30 text-center transition-colors hover:border-secondary",
          dragOver && "border-secondary bg-accent-50"
        )}
      >
        {value ? (
          <>
            <img src={value} alt="Profile" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <Camera className="h-6 w-6 text-muted-foreground" />
            <span className="px-2 text-[11px] text-muted-foreground">Drag &amp; drop or click</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <p className="text-[11px] text-muted-foreground">JPG/PNG, max 2MB</p>
    </div>
  )
}
