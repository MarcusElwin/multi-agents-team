'use client';

import {
  Bar, BarChart, Line, LineChart, Area, AreaChart, Pie, PieChart, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, FileBarChart } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MarkdownContent } from './MarkdownContent';
import type { ReportSpec } from '@/lib/tools/report';

// Stone/neutral-friendly palette for chart series.
const PALETTE = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6'];

export function ReportView({ report }: { report: ReportSpec }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 bg-stone-50/70 px-5 py-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          <FileBarChart className="h-3.5 w-3.5" />
          Report
        </div>
        <h2 className="mt-1 text-lg font-semibold text-stone-900">{report.title}</h2>
        <p className="mt-1 text-sm leading-snug text-stone-600">{report.summary}</p>
      </div>

      <div className="space-y-6 px-5 py-5">
        {report.kpis && report.kpis.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {report.kpis.map((k, i) => (
              <KpiCard key={i} {...k} />
            ))}
          </div>
        )}

        {report.charts?.map((c, i) => (
          <ChartBlock key={`chart-${i}`} chart={c} />
        ))}

        {report.tables?.map((t, i) => (
          <TableBlock key={`table-${i}`} table={t} />
        ))}

        {report.sections?.map((s, i) => (
          <section key={`sec-${i}`}>
            <h3 className="mb-1 text-sm font-semibold text-stone-900">{s.heading}</h3>
            <div className="text-sm text-stone-700">
              <MarkdownContent content={s.body} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ label, value, delta, trend }: NonNullable<ReportSpec['kpis']>[number]) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const tone =
    trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-stone-400';
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/50 px-3 py-2.5">
      <div className="truncate text-[11px] font-medium text-stone-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-stone-900">{value}</div>
      {delta && (
        <div className={cn('mt-0.5 flex items-center gap-0.5 text-[11px] font-medium', tone)}>
          <TrendIcon className="h-3 w-3" />
          {delta}
        </div>
      )}
    </div>
  );
}

function ChartBlock({ chart }: { chart: NonNullable<ReportSpec['charts']>[number] }) {
  const { type, title, data, series, xKey = 'name' } = chart;
  return (
    <div>
      {title && <h3 className="mb-2 text-sm font-semibold text-stone-900">{title}</h3>}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <YAxis tick={{ fontSize: 11 }} stroke="#a8a29e" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Area key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.15} strokeWidth={2} />
              ))}
            </AreaChart>
          ) : (
            // pie: plot the first series as the value.
            <PieChart>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie data={data} dataKey={series[0]} nameKey={xKey} cx="50%" cy="50%" outerRadius={90} label>
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableBlock({ table }: { table: NonNullable<ReportSpec['tables']>[number] }) {
  return (
    <div>
      {table.title && <h3 className="mb-2 text-sm font-semibold text-stone-900">{table.title}</h3>}
      <div className="overflow-x-auto rounded-xl border border-stone-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
            <tr>
              {table.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-stone-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
