"use client"
// Catches errors in the root layout and in routes without their own error.tsx
// (the public pages). It replaces the root layout, so it renders its own
// <html>/<body> and can't rely on globals.css: styles are inline.
import * as React from "react"

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  React.useEffect(() => {
    console.error("Unhandled application error:", error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#F3F5F8", color: "#0D1B2E" }}>
        <title>Something went wrong — Citi Clinic HMS</title>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", boxSizing: "border-box" }}>
          <div role="alert" style={{ background: "#fff", borderRadius: "18px", padding: "40px", maxWidth: "440px", width: "100%", boxSizing: "border-box", boxShadow: "0 1px 3px rgba(10,27,51,0.07), 0 20px 60px rgba(10,27,51,0.12)", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ fontSize: "0.9rem", color: "#64748B", margin: "0 0 24px", lineHeight: 1.5 }}>
              The application hit an unexpected error. Try again, or return to the start page. If it keeps happening, contact your administrator.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "0 0 24px" }}>
                Reference: <code>{error.digest}</code>
              </p>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => retry()}
                style={{ padding: "11px 20px", borderRadius: "10px", border: "none", background: "#0F2A4D", color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}
              >
                Try again
              </button>
              {/* Plain <a>: a full reload is the safest recovery when the root layout failed */}
              <a
                href="/"
                style={{ padding: "11px 20px", borderRadius: "10px", border: "1.5px solid #D8E0EB", color: "#374B65", fontWeight: 600, fontSize: "0.9rem", textDecoration: "none" }}
              >
                Go to start page
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
