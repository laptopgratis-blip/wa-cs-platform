'use client'

// Bar chart pesan 7 hari terakhir — dipisah role USER vs AI.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface ChartPoint {
  label: string // "Sen", "Sel", dst.
  USER: number
  AI: number
}

export function MessagesChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            className="text-xs"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            className="text-xs"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* Customer = orange-200 (light), AI = orange-500 (primary) */}
          <Bar dataKey="USER" name="Customer" fill="#fed7aa" radius={[6, 6, 0, 0]} />
          <Bar dataKey="AI" name="AI" fill="#f97316" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
