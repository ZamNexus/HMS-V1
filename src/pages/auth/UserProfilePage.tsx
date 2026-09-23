import * as React from "react"
import { useAuth } from "@/lib/auth"
import { ROLE_LABELS } from "@/data/users"
import { initials } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ShieldCheck, User, Mail, Briefcase, KeyRound, Save } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

export function UserProfilePage() {
  const { user } = useAuth()
  const { toast } = useToast()

  if (!user) return null

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    toast({
      title: "Profile Updated",
      description: "Your profile settings have been saved successfully.",
    })
  }

  return (
    <div className="space-y-6 pb-10 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Profile Settings</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Manage your account details and preferences
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Avatar & Summary */}
        <div className="space-y-6">
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden rounded-[1.5rem]">
            <div className="h-24 bg-gradient-to-r from-[#0A1B33] via-[#0F2A4D] to-[#16375F]" />
            <CardContent className="px-6 pb-6 pt-0 relative">
              <div className="absolute -top-12 left-6">
                <Avatar className="h-24 w-24 ring-4 ring-white shadow-xl">
                  <AvatarFallback className="bg-gradient-to-br from-[#1CC0CE] to-[#0891B2] text-3xl font-bold text-white">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="pt-16">
                <h2 className="text-xl font-bold text-[#0D1B2E]">{user.name}</h2>
                <div className="flex items-center gap-1.5 mt-1 text-sm font-medium text-[#1CC0CE]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{ROLE_LABELS[user.role]}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span>{user.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    <span className="capitalize">{user.role.replace("_", " ")} Access</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 rounded-[1.5rem]">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-[#0D1B2E] mb-6 flex items-center gap-2">
                <User className="h-5 w-5 text-[#1CC0CE]" />
                Personal Information
              </h3>
              
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name</label>
                    <input 
                      type="text" 
                      defaultValue={user.name}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Address</label>
                    <input 
                      type="email" 
                      defaultValue={user.email}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Role / Designation</label>
                    <input 
                      type="text" 
                      defaultValue={ROLE_LABELS[user.role]}
                      disabled
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-100 text-sm font-medium text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1">Role assignments can only be changed by an Administrator.</p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
                  <Button type="button" variant="outline" className="rounded-xl h-11 px-6 font-bold">
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 rounded-[1.5rem]">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-[#0D1B2E] mb-2 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#1CC0CE]" />
                Security
              </h3>
              <p className="text-sm text-slate-500 mb-6">Manage your password and security preferences.</p>
              
              <div className="flex items-center justify-between py-4 border-t border-slate-100">
                <div>
                  <h4 className="font-semibold text-sm text-slate-900">Change Password</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Update your password to keep your account secure.</p>
                </div>
                <Button variant="outline" className="rounded-xl font-bold" onClick={() => toast({ title: "Check Email", description: "Password reset link sent to your email." })}>
                  Update Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
