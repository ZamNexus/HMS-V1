import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useAuth } from "@/lib/auth"
import { ROLE_LABELS } from "@/data/users"
import { useToast } from "@/components/ui/use-toast"

// ─── Role labels (extended with public Patient role) ─────────────
const ALL_ROLE_LABELS: Record<string, string> = {
  ...ROLE_LABELS,
  patient: "Patient",
}

// ─── Form schema (unchanged) ─────────────────────────────────────
const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

// ─── Inline SVG icons ────────────────────────────────────────────
// Using inline SVGs so we have full control over stroke, size, and color
// without depending on Lucide class names for these precise design specs.

function IcoPulse({ size = 18, color = "#1CC0CE" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IcoMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function IcoLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function IcoEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IcoEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

function IcoShield({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function IcoArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function IcoLogOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

// ─── ECG Watermark — 3 traces at 0.16 opacity ────────────────────
function EcgWatermark() {
  // Single P-QRS-T complex, repeated by path offset across 3 y positions
  const trace = (cy: number) =>
    `M-10,${cy} L50,${cy} C58,${cy} 63,${cy - 15} 75,${cy - 15} C87,${cy - 15} 92,${cy} 102,${cy}` +
    ` L110,${cy} L114,${cy + 10} L124,${cy - 78} L134,${cy + 22} L140,${cy}` +
    ` L150,${cy} C158,${cy} 163,${cy - 31} 173,${cy - 31} C183,${cy - 31} 188,${cy} 198,${cy}` +
    ` L480,${cy}`

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox="0 0 440 720"
      preserveAspectRatio="xMidYMid slice"
    >
      <path d={trace(180)} stroke="#1CC0CE" strokeWidth="2" fill="none" opacity="0.16" />
      <path d={trace(360)} stroke="#1CC0CE" strokeWidth="2" fill="none" opacity="0.16" />
      <path d={trace(540)} stroke="#1CC0CE" strokeWidth="2" fill="none" opacity="0.16" />
    </svg>
  )
}

// ─── Already-signed-in panel ─────────────────────────────────────
// Shown instead of the sign-in form when a session is already active.

function AlreadySignedIn({
  user,
  logout,
  navigate,
  roleParam,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>
  logout: () => void
  navigate: ReturnType<typeof useNavigate>
  roleParam: string | null
}) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F3F5F8", padding: "24px", fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: "18px", padding: "40px",
        maxWidth: "420px", width: "100%",
        boxShadow: "0 1px 3px rgba(10,27,51,0.07), 0 20px 60px rgba(10,27,51,0.12)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "28px" }}>
          <IcoPulse />
          <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "#0F2A4D" }}>Citi Clinic</span>
        </div>

        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0D1B2E", marginBottom: "6px" }}>
          Already signed in
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: "24px" }}>
          You have an active session. Continue to your dashboard or switch accounts.
        </p>

        {/* Current session card */}
        <div style={{
          background: "#F8FAFC", border: "1.5px solid #D8E0EB", borderRadius: "12px",
          padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "24px",
        }}>
          <div style={{
            width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #0A1B33 0%, #16375F 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: "0.85rem", fontWeight: 700,
          }}>
            {user.avatar}
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0D1B2E", marginBottom: "2px" }}>{user.name}</p>
            <p style={{ fontSize: "0.78rem", color: "#64748B", marginBottom: "6px" }}>{user.email}</p>
            <span style={{
              display: "inline-flex", alignItems: "center",
              background: "rgba(28,192,206,0.10)", border: "1px solid rgba(28,192,206,0.30)",
              color: "#0891B2", borderRadius: "20px", padding: "2px 10px",
              fontSize: "0.72rem", fontWeight: 600,
            }}>
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              width: "100%", padding: "13px 16px", borderRadius: "10px",
              background: "linear-gradient(180deg, #1D4080 0%, #0F2A4D 100%)",
              color: "#fff", fontWeight: 700, fontSize: "0.9rem",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: "0 4px 14px rgba(10,27,51,0.28)", fontFamily: "inherit",
            }}
          >
            Continue to Dashboard <IcoArrow />
          </button>

          <button
            onClick={() => { logout(); navigate("/login" + (roleParam ? `?role=${roleParam}` : "")) }}
            style={{
              width: "100%", padding: "13px 16px", borderRadius: "10px",
              background: "transparent", border: "1.5px solid #D8E0EB",
              color: "#64748B", fontWeight: 600, fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontFamily: "inherit",
            }}
          >
            Sign out &amp; switch account <IcoLogOut />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Login page ──────────────────────────────────────────────────

export function LoginPage() {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = React.useState(false)
  const [searchParams] = useSearchParams()

  // Role param passed from landing page: /login?role=doctor
  const roleParam = searchParams.get("role")
  const roleLabel = roleParam ? (ALL_ROLE_LABELS[roleParam] ?? null) : null

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: false },
  })

  // Already logged in — show switch-account screen instead of form
  if (user) {
    return <AlreadySignedIn user={user} logout={logout} navigate={navigate} roleParam={roleParam} />
  }

  const onSubmit = (values: FormValues) => {
    const result = login(values.email, values.password)
    if (!result.ok) {
      toast({ variant: "destructive", title: "Sign in failed", description: result.error })
      return
    }
    navigate("/dashboard")
  }

  // ── Shared input helpers ────────────────────────────────────────
  const baseInput: React.CSSProperties = {
    width: "100%",
    paddingTop: "12px",
    paddingBottom: "12px",
    paddingRight: "14px",
    background: "#F8FAFC",
    border: "1.5px solid #D8E0EB",
    borderRadius: "10px",
    fontSize: "0.9rem",
    color: "#0D1B2E",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s, box-shadow 0.15s",
    fontFamily: "inherit",
  }

  const onFocusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#1CC0CE"
    e.target.style.boxShadow = "0 0 0 3px rgba(28,192,206,0.15)"
  }
  const onBlurInput = (e: React.FocusEvent<HTMLInputElement>, hasError: boolean) => {
    e.target.style.borderColor = hasError ? "#ef4444" : "#D8E0EB"
    e.target.style.boxShadow = "none"
  }

  return (
    <div
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      className="flex min-h-screen flex-col md:flex-row"
    >
      {/* ══════════════════════════════════════════════════════════
          LEFT BRAND PANEL
          Full height on desktop (42% width), compact strip on mobile
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "linear-gradient(175deg, #0A1B33 0%, #0F2A4D 55%, #16375F 100%)",
          position: "relative",
          overflow: "hidden",
        }}
        className="flex w-full flex-col md:w-[42%] md:min-h-screen"
      >
        <EcgWatermark />

        {/* Inner content — padded, above watermark */}
        <div
          style={{ padding: "28px 36px" }}
          className="relative z-10 flex flex-1 flex-col justify-between"
        >
          {/* Logo — always visible */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <IcoPulse size={20} />
            <span style={{ color: "#1CC0CE", fontWeight: 700, fontSize: "1.15rem" }}>
              Citi Clinic
            </span>
          </div>

          {/* Centered body — hidden on mobile to keep panel compact */}
          <div className="hidden md:block" style={{ padding: "40px 0" }}>
            <h2 style={{
              color: "#EAF1FB", fontWeight: 700, fontSize: "2rem",
              lineHeight: 1.2, maxWidth: "13ch", marginBottom: "16px",
            }}>
              Hospital Management System
            </h2>

            {/* Bilingual address */}
            <p style={{ color: "#7FA3C8", fontSize: "0.96rem", marginBottom: "3px" }}>
              عیادہ المدینہ
            </p>
            <p style={{ color: "#AFC2DB", fontSize: "0.82rem", marginBottom: "28px" }}>
              Scheme III, Bostan Khan Road, Rawalpindi
            </p>

            {/* Trust note */}
            <div style={{
              background: "rgba(28,192,206,0.10)",
              border: "1px solid rgba(28,192,206,0.28)",
              borderRadius: "10px",
              padding: "14px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              maxWidth: "340px",
            }}>
              <span style={{ color: "#1CC0CE", marginTop: "1px", flexShrink: 0 }}>
                <IcoShield size={15} />
              </span>
              <p style={{ color: "#AFC2DB", fontSize: "0.8rem", lineHeight: 1.6, margin: 0 }}>
                Every session is logged with time, device, and department for security and
                compliance review.
              </p>
            </div>
          </div>

          {/* Copyright — desktop only */}
          <p className="hidden md:block" style={{ color: "#3E5472", fontSize: "0.72rem" }}>
            © 2026 Citi Clinic. All rights reserved.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          RIGHT FORM PANEL
          Centered white card on soft off-white background
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{ background: "#F3F5F8", flex: 1 }}
        className="flex items-center justify-center p-6 md:p-8"
      >
        {/* Card */}
        <div style={{
          background: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 1px 3px rgba(10,27,51,0.07), 0 20px 60px rgba(10,27,51,0.13)",
          padding: "40px",
          maxWidth: "440px",
          width: "100%",
        }}>

          {/* ── Icon mark ───────────────────────────────────────── */}
          <div style={{
            width: "46px", height: "46px", borderRadius: "12px",
            background: "linear-gradient(135deg, #0A1B33 0%, #16375F 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(10,27,51,0.30)",
            marginBottom: "20px",
          }}>
            <IcoPulse size={22} />
          </div>

          {/* ── Heading ─────────────────────────────────────────── */}
          <h1 style={{ fontSize: "1.55rem", fontWeight: 700, color: "#0D1B2E", marginBottom: "6px" }}>
            Sign in
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: roleLabel ? "14px" : "24px" }}>
            Enter your credentials to reach your dashboard.
          </p>

          {/* ── Role badge (from landing page query param) ───────── */}
          {roleLabel && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              background: "rgba(28,192,206,0.10)",
              border: "1px solid rgba(28,192,206,0.30)",
              borderRadius: "999px",
              padding: "5px 14px",
              marginBottom: "22px",
            }}>
              <span style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: "#1CC0CE", flexShrink: 0, display: "block",
              }} />
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0891B2" }}>
                Signing in as {roleLabel}
              </span>
            </div>
          )}

          {/* ── Form ────────────────────────────────────────────── */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: "18px" }}
          >

            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374B65", marginBottom: "7px" }}
              >
                Email address
              </label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "14px", top: "50%",
                  transform: "translateY(-50%)", color: "#9BA8BB",
                  pointerEvents: "none", display: "flex", alignItems: "center",
                }}>
                  <IcoMail />
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="you@citiclinic.pk"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                  style={{ ...baseInput, paddingLeft: "44px", borderColor: errors.email ? "#ef4444" : "#D8E0EB" }}
                  onFocus={onFocusInput}
                  onBlur={(e) => onBlurInput(e, !!errors.email)}
                />
              </div>
              {errors.email && (
                <p style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: "5px", fontWeight: 500 }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password field — label + forgot-password as one header row,
                lock icon + input + eye toggle as one cohesive control shell */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "7px" }}>
                <label
                  htmlFor="password"
                  style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374B65" }}
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  style={{ fontSize: "0.8rem", color: "#1CC0CE", textDecoration: "none", fontWeight: 500 }}
                >
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "14px", top: "50%",
                  transform: "translateY(-50%)", color: "#9BA8BB",
                  pointerEvents: "none", display: "flex", alignItems: "center",
                }}>
                  <IcoLock />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                  style={{ ...baseInput, paddingLeft: "44px", paddingRight: "48px", borderColor: errors.password ? "#ef4444" : "#D8E0EB" }}
                  onFocus={onFocusInput}
                  onBlur={(e) => onBlurInput(e, !!errors.password)}
                />
                {/* Eye toggle — inside the same input shell */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: "12px", top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "#9BA8BB", padding: "4px", borderRadius: "6px",
                    display: "flex", alignItems: "center", lineHeight: 0,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#374B65" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9BA8BB" }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.outline = "2px solid #1CC0CE"
                    ;(e.currentTarget as HTMLButtonElement).style.outlineOffset = "2px"
                  }}
                  onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = "none" }}
                >
                  {showPassword ? <IcoEyeOff /> : <IcoEye />}
                </button>
              </div>
              {errors.password && (
                <p style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: "5px", fontWeight: 500 }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me */}
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <input
                id="remember"
                type="checkbox"
                {...register("remember")}
                style={{ width: "16px", height: "16px", accentColor: "#1CC0CE", cursor: "pointer", flexShrink: 0 }}
              />
              <label htmlFor="remember" style={{ fontSize: "0.82rem", color: "#64748B", cursor: "pointer" }}>
                Remember me on this device
              </label>
            </div>

            {/* Sign in button — navy gradient with inset highlight and depth shadow */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "14px",
                background: isSubmitting
                  ? "#8A9BB0"
                  : "linear-gradient(180deg, #1D4080 0%, #0F2A4D 100%)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.95rem",
                border: "none",
                borderRadius: "10px",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                boxShadow: isSubmitting
                  ? "none"
                  : "0 1px 0 rgba(255,255,255,0.10) inset, 0 4px 16px rgba(10,27,51,0.32)",
                fontFamily: "inherit",
                transition: "filter 0.15s, transform 0.1s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.12)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.filter = ""
              }}
              onMouseDown={(e) => {
                if (!isSubmitting) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)"
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = ""
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLButtonElement).style.outline = "2px solid #1CC0CE"
                ;(e.currentTarget as HTMLButtonElement).style.outlineOffset = "2px"
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLButtonElement).style.outline = "none"
              }}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* ── Security reassurance line ──────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", marginTop: "22px", color: "#94A3B8",
          }}>
            <IcoShield size={13} />
            <span style={{ fontSize: "0.77rem" }}>
              Secured with encrypted, audit-logged access
            </span>
          </div>

          {/* ── Help line ─────────────────────────────────────── */}
          <p style={{ fontSize: "0.77rem", color: "#94A3B8", textAlign: "center", marginTop: "8px" }}>
            Having trouble signing in?{" "}
            <span style={{ color: "#64748B" }}>Contact your facility administrator.</span>
          </p>

        </div>
      </div>
    </div>
  )
}
