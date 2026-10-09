"use client"
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
  const labelId = React.useId()
  const openPicker = () => inputRef.current?.click()

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
      <span id={labelId} className="block text-sm font-medium">{label}</span>
      {/* Remove button is a sibling of the drop zone, not nested inside it, to avoid nested interactive controls */}
      <div className="relative h-32 w-32">
        <div
          role="button"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-describedby={`${labelId}-hint`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker() }
          }}
          className={cn(
            "flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/30 text-center transition-colors hover:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            dragOver && "border-secondary bg-accent-50"
          )}
        >
          {value ? (
            <img src={value} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <>
              <Camera className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <span className="px-2 text-xs text-muted-foreground">Drag &amp; drop or click</span>
            </>
          )}
        </div>
        {value && (
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => onChange(undefined)}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          // Clear so choosing the same file again (e.g. after removing it) still fires onChange
          e.target.value = ""
        }}
      />
      <p id={`${labelId}-hint`} className="text-xs text-muted-foreground">JPG/PNG, max 2MB</p>
    </div>
  )
}
