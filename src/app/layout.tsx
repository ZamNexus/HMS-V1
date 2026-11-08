import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { connection } from "next/server"
import "./globals.css"
import { AuthProvider } from "@/lib/auth"
import { OfflineBanner } from "@/components/shared/OfflineBanner"
import { QueryProvider } from "@/lib/query/QueryProvider"

// Same families and weights the prototype loaded from Google Fonts in index.html
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "Citi Clinic HMS",
  description: "Hospital Management System",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The Content-Security-Policy carries a fresh nonce per request (src/proxy.ts, src/lib/csp.ts); Next.js puts it on its scripts while rendering, so every page is rendered per request.
  await connection()
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <QueryProvider>
          <OfflineBanner />
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
