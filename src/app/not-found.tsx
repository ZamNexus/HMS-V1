"use client"
import * as React from "react"
import Link from "next/link"
import { Home, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-center px-4">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 shadow-sm mb-6 ring-1 ring-slate-200">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
      </div>
      <h1 className="text-4xl font-black text-[#0D1B2E] tracking-tight mb-2">404 - Page Not Found</h1>
      <p className="text-muted-foreground text-lg max-w-md mx-auto mb-8 font-medium">
        Oops! The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Button asChild onClick={() => window.history.back()} variant="outline" className="h-12 px-6 rounded-xl font-bold">
          <button>Go Back</button>
        </Button>
        <Button asChild className="h-12 px-6 rounded-xl bg-[#0F2A4D] shadow-lg shadow-[#0F2A4D]/20 border-0 font-bold">
          <Link href="/dashboard">
            <Home className="mr-2 h-5 w-5" /> Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}
