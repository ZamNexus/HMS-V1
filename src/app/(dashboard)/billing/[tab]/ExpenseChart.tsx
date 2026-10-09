"use client"
// Loaded with next/dynamic from the Expenses tab only, so the other billing
// tabs don't download recharts.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCurrency } from "@/lib/utils"

export function ExpenseByCategoryChart({ data }: { data: { category: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
        <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `Rs.${v/1000}k`} />
        <YAxis type="category" dataKey="category" width={90} fontSize={11} tickLine={false} axisLine={false} tick={{fill: '#64748B', fontWeight: 600}} />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} cursor={{fill: '#F8FAFC'}} />
        <Bar dataKey="amount" fill="#F43F5E" radius={[0, 4, 4, 0]} barSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
