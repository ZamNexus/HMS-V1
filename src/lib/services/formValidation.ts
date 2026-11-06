import { failedChecks } from "@/lib/validation"

// Client-side checks only improve feedback; the backend remains authoritative
// and its VALIDATION_FAILED details are shown when it rejects a request.

export function validateUserForm(f: {
  name: string
  email: string
  role: string
  password: string
  confirmPassword: string
  isNew: boolean
}): string[] {
  return [
    ...failedChecks([
      [f.name, "Full Name is required"],
      [f.email, "Email is required"],
      [f.role, "Role is required"],
    ]),
    ...(f.isNew && !f.password ? ["Password is required for new users"] : []),
    ...(f.password && f.password !== f.confirmPassword ? ["Passwords do not match"] : []),
  ]
}

export function validateDoctorForm(f: { name: string; fee: number }): string[] {
  return failedChecks([
    [f.name.trim(), "Full Name is required"],
    [f.fee, "Consultation Fee is required"],
  ])
}
