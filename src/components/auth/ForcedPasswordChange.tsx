"use client"
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"

/**
 * The only screen a user sees while a temporary password must be replaced (MD section 3): everything else the API answers with 403
 * PASSWORD_CHANGE_REQUIRED. After the change the same session carries on, with no second sign-in.
 */
export function ForcedPasswordChange() {
  const { user, logout } = useAuth()
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-xl font-bold text-[#0D1B2E]">Choose a new password</h1>
        <p className="mb-5 mt-1 text-sm text-slate-600">
          {user ? `${user.name}, you signed in with a temporary password.` : "You signed in with a temporary password."} Replace it to continue.
        </p>
        <ChangePasswordForm />
        <Button type="button" variant="ghost" onClick={() => void logout()} className="mt-3 w-full text-slate-600">
          Sign out
        </Button>
      </div>
    </main>
  )
}
