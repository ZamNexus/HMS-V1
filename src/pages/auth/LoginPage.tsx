import * as React from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Activity, Eye, EyeOff } from "lucide-react"

import { useAuth } from "@/lib/auth"
import { USERS, ROLE_LABELS } from "@/data/users"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = React.useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", remember: false } })

  if (user) return <Navigate to="/dashboard" replace />

  const onSubmit = (values: FormValues) => {
    const result = login(values.email, values.password)
    if (!result.ok) {
      toast({ variant: "destructive", title: "Sign in failed", description: result.error })
      return
    }
    navigate("/dashboard")
  }

  const quickFill = (email: string, password: string) => {
    setValue("email", email)
    setValue("password", password)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-teal-800 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-navy-900 p-8 text-white md:flex">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-teal-600" />
            <span className="text-lg font-bold text-teal-600">Citi Clinic</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold leading-tight">
              Hospital Management System
            </h2>
            <p className="mt-2 text-sm text-white/60">
              عيادة المدينة — Scheme III, Bostan Khan Road, Rawalpindi
            </p>
          </div>
          <p className="text-xs text-white/30">© 2026 Citi Clinic. All rights reserved.</p>
        </div>

        <div className="p-8">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <Activity className="h-5 w-5 text-secondary" />
            <span className="font-bold text-secondary">Citi Clinic</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Sign In</h1>
          <p className="mb-6 text-sm text-muted-foreground">Patient Management System</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="you@citiclinic.pk" {...register("email")} />
              {errors.email && <p className="text-xs font-medium text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs font-medium text-destructive">{errors.password.message}</p>}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="remember" onCheckedChange={(v) => setValue("remember", Boolean(v))} />
              <Label htmlFor="remember" className="cursor-pointer font-normal text-muted-foreground">
                Remember me
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Demo Accounts
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => quickFill(u.email, u.password)}
                  className={cn(
                    "rounded-md border border-border px-2 py-1.5 text-left text-xs transition-colors hover:border-secondary hover:bg-accent-50"
                  )}
                >
                  <div className="font-medium text-foreground">{ROLE_LABELS[u.role]}</div>
                  <div className="truncate text-muted-foreground">{u.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
