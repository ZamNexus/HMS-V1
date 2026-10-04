"use client"
// This file is loaded dynamically (ssr: false) to prevent recharts from
// accessing browser globals (Redux store, window) during server-side rendering.
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, AreaChart,
} from "recharts"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"

const WEEKLY_VISITS = [
  { day: "Mon", count: 18 }, { day: "Tue", count: 22 }, { day: "Wed", count: 19 },
  { day: "Thu", count: 31 }, { day: "Fri", count: 28 }, { day: "Sat", count: 15 }, { day: "Sun", count: 8 },
]
const REVENUE_7D = [35000, 42000, 38000, 51000, 44000, 39000, 42500]
const revenueData = REVENUE_7D.map((v, i) => ({
  label: format(new Date(Date.now() - (6 - i) * 86400000), "dd MMM"),
  value: v,
}))

export function PatientFlowChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={WEEKLY_VISITS} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} dy={10} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} />
        <Tooltip
          cursor={{ fill: "#F8FAFC" }}
          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontWeight: 700, color: "#0D1B2E" }}
          formatter={(v) => [`${v} patients`, "Visits"]}
        />
        <Bar dataKey="count" fill="#1CC0CE" radius={[6, 6, 0, 0]} barSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F2A4D" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#0F2A4D" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} dy={10} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} />
        <Tooltip
          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontWeight: 700, color: "#0D1B2E" }}
          formatter={(v) => [formatCurrency(Number(v)), "Revenue"]}
        />
        <Area type="monotone" dataKey="value" stroke="#0F2A4D" strokeWidth={4} fill="url(#revGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
