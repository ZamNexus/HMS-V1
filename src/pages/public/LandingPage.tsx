import { useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { ROLE_LABELS } from "@/data/users"
import {
  Activity,
  ShieldCheck,
  Stethoscope,
  HeartPulse,
  ClipboardList,
  Receipt,
  Pill,
  FlaskConical,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Role definitions ────────────────────────────────────────────

const ROLES = [
  {
    key: "admin",
    label: "Administrator",
    desc: "System administration & user management",
    Icon: ShieldCheck,
  },
  {
    key: "doctor",
    label: "Doctor",
    desc: "Patient consultations & clinical records",
    Icon: Stethoscope,
  },
  {
    key: "nurse",
    label: "Nurse",
    desc: "Ward care, vitals & patient monitoring",
    Icon: HeartPulse,
  },
  {
    key: "receptionist",
    label: "Receptionist",
    desc: "Patient registration & appointments",
    Icon: ClipboardList,
  },
  {
    key: "billing",
    label: "Billing",
    desc: "Invoices, payments & financial records",
    Icon: Receipt,
  },
  {
    key: "pharmacist",
    label: "Pharmacist",
    desc: "Medicine dispensing & inventory",
    Icon: Pill,
  },
  {
    key: "lab_tech",
    label: "Lab Technician",
    desc: "Test orders, samples & results",
    Icon: FlaskConical,
  },
  {
    key: "patient",
    label: "Patient",
    desc: "View your records & appointments",
    Icon: UserRound,
  },
] as const

// ─── ECG Hero Illustration ───────────────────────────────────────
// Inline SVG: brand navy ECG trace on off-white dot-grid background.
// No external assets — renders at any resolution without pixelation.

function EcgIllustration() {
  return (
    <svg
      viewBox="0 0 560 300"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id="ecg-dots"
          x="0"
          y="0"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#1A3C6E" opacity="0.18" />
        </pattern>
        {/* Left + right edge fades so the trace blends into the card */}
        <linearGradient id="fade-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="#EEF2F8" stopOpacity="1" />
          <stop offset="12%" stopColor="#EEF2F8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fade-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="88%" stopColor="#EEF2F8" stopOpacity="0" />
          <stop offset="100%" stopColor="#EEF2F8" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="560" height="300" fill="#EEF2F8" rx="16" />
      {/* Dot grid */}
      <rect width="560" height="300" fill="url(#ecg-dots)" rx="16" />

      {/* Subtle horizontal reference lines */}
      <line x1="0" y1="75"  x2="560" y2="75"  stroke="#1A3C6E" strokeWidth="0.5" opacity="0.07" />
      <line x1="0" y1="150" x2="560" y2="150" stroke="#1A3C6E" strokeWidth="1"   opacity="0.10" strokeDasharray="4 10" />
      <line x1="0" y1="225" x2="560" y2="225" stroke="#1A3C6E" strokeWidth="0.5" opacity="0.07" />

      {/* ── ECG trace — two P-QRS-T complexes ──────────────── */}
      {/*
        Anatomy (centerline y=150):
          Lead-in flat → P wave (gentle bump) → PR flat → QRS (sharp spike) →
          ST flat → T wave (broad bump) → Lead-out flat
      */}
      <path
        d="
          M -10,150
          L 55,150
          C 65,150 70,127 86,127 C 102,127 107,150 120,150
          L 130,150 L 134,163 L 144,44 L 154,185 L 161,150
          L 172,150
          C 182,150 187,110 198,110 C 209,110 214,150 228,150
          L 268,150
          C 278,150 283,127 299,127 C 315,127 320,150 333,150
          L 343,150 L 347,163 L 357,44 L 367,185 L 374,150
          L 385,150
          C 395,150 400,110 411,110 C 422,110 427,150 441,150
          L 570,150
        "
        stroke="#1A3C6E"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Teal accent dot at each R-peak */}
      <circle cx="144" cy="44" r="5" fill="#0891B2" />
      <circle cx="357" cy="44" r="5" fill="#0891B2" opacity="0.45" />

      {/* Edge fades */}
      <rect width="560" height="300" fill="url(#fade-l)" rx="16" />
      <rect width="560" height="300" fill="url(#fade-r)" rx="16" />

      {/* Watermark label */}
      <text
        x="24"
        y="28"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="9.5"
        fill="#1A3C6E"
        opacity="0.38"
        letterSpacing="3.5"
        fontWeight="700"
      >
        PATIENT MONITORING
      </text>
    </svg>
  )
}

// ─── Page ────────────────────────────────────────────────────────

export function LandingPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-secondary" />
            <span className="text-lg font-bold text-primary">Citi Clinic</span>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Signed in as <span className="font-medium text-foreground">{ROLE_LABELS[user.role]}</span>
              </span>
              <Button size="sm" onClick={() => navigate("/dashboard")}>
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout(); navigate("/") }}
                className="text-muted-foreground hover:text-danger-600"
              >
                Sign out
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/login")}
            >
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="container grid items-center gap-10 py-12 md:grid-cols-2 md:py-16 lg:gap-16">
        {/* Left: text + CTA */}
        <div className="flex flex-col gap-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
            Hospital Management System
          </p>
          <h1 className="text-3xl font-bold leading-tight text-primary sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
            Welcome to<br className="hidden sm:block" /> Citi Clinic
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            One system for admissions, wards, pharmacy, and billing — built for every role in the clinic.
          </p>
          <div className="pt-1">
            <Button
              size="lg"
              onClick={() => navigate("/login")}
              className="bg-primary shadow-md hover:bg-primary/90 hover:shadow-lg transition-shadow"
            >
              Get Started
            </Button>
          </div>
        </div>

        {/* Right: ECG illustration */}
        <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-navy-100">
          <EcgIllustration />
        </div>
      </section>

      {/* ── Role card grid ───────────────────────────────────── */}
      <section className="container pb-16">
        <p className="mb-7 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Select your role to get started
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map(({ key, label, desc, Icon }) => (
            <div
              key={key}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:border-secondary/50 hover:shadow-md"
            >
              {/* Icon badge */}
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 ring-1 ring-navy-100 transition-colors group-hover:bg-teal-50 group-hover:ring-teal-100">
                <Icon
                  className="h-5 w-5 text-navy-700 transition-colors group-hover:text-teal-600"
                  strokeWidth={1.75}
                />
              </div>

              {/* Role name */}
              <h3 className="mb-1 text-sm font-semibold text-foreground">{label}</h3>

              {/* Description */}
              <p className="mb-4 flex-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>

              {/* Access button */}
              <Button
                size="sm"
                className="w-full bg-primary shadow-sm hover:bg-primary/90 transition-shadow hover:shadow"
                onClick={() => navigate(`/login?role=${key}`)}
              >
                Access
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © 2026 Citi Clinic · عيادة المدينة · Scheme III, Bostan Khan Road, Rawalpindi
      </footer>
    </div>
  )
}
