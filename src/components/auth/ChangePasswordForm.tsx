"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordErrorsFrom, type PasswordFormErrors } from "@/lib/session/passwordErrors"
import { useSubmitGuard } from "@/lib/useSubmitGuard"

/**
 * Change password. Used on the forced screen (a temporary password must be replaced before anything else works) and on the Profile page.
 * The rules are shown before the user types; each problem the server finds is shown after. Submit is locked while the request is in flight, so
 * a double click cannot send it twice. The same access token keeps working afterwards; the user's OTHER sessions are ended by the server.
 */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { changePassword } = useAuth()
  const { pending, run } = useSubmitGuard()
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [errors, setErrors] = React.useState<PasswordFormErrors>({ problems: [] })
  const [done, setDone] = React.useState(false)
  const uid = React.useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < MIN_PASSWORD_LENGTH) return setErrors({ problems: [], next: `Use at least ${MIN_PASSWORD_LENGTH} characters.` })
    if (next !== confirm) return setErrors({ problems: [], next: "The two new passwords do not match." })
    setErrors({ problems: [] })
    await run(async () => {
      try {
        await changePassword(current, next)
        setCurrent("")
        setNext("")
        setConfirm("")
        setDone(true)
        onDone?.()
      } catch (err) {
        setErrors(passwordErrorsFrom(err))
      }
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="change-password-form">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p className="mb-1 font-bold">Your new password must meet these rules</p>
        <ul className="list-disc pl-5">
          {PASSWORD_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-current`}>Current password</Label>
        <Input id={`${uid}-current`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={!!errors.current} aria-describedby={errors.current ? `${uid}-current-err` : undefined} />
        {errors.current && <p id={`${uid}-current-err`} role="alert" className="text-xs text-red-600">{errors.current}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-new`}>New password</Label>
        <Input id={`${uid}-new`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!errors.next} aria-describedby={errors.next ? `${uid}-new-err` : undefined} />
        {errors.next && (
          <div id={`${uid}-new-err`} role="alert" className="text-xs text-red-600">
            <p>{errors.next}</p>
            {errors.problems.length > 0 && <ul data-testid="password-problems" className="list-disc pl-5">{errors.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-confirm`}>Repeat the new password</Label>
        <Input id={`${uid}-confirm`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {errors.general && (
        <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <p>{errors.general}</p>
          {errors.requestId && <p data-testid="support-reference" className="mt-1 text-[11px]">Support reference: <span className="font-mono">{errors.requestId}</span></p>}
        </div>
      )}
      {done && <p role="status" className="text-sm text-emerald-700">Password changed. Your other sessions were signed out.</p>}

      <Button type="submit" disabled={pending || !current || !next || !confirm} className="h-11 w-full">
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  )
}
