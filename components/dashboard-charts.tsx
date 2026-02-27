"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type ChartData = {
  monthlyRevenue: { month: string; posCents: number; invoiceCents: number }[];
  membershipGrowth: { month: string; active: number }[];
  weeklyAttendance: { week: string; count: number }[];
  leadSources: { name: string; value: number }[];
};

const PIE_COLORS = ["#c41111", "#2563eb", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#6b7280"];

function formatDollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatMonthLabel(month: string) {
  const [, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(m, 10) - 1] || m;
}

export default function DashboardCharts() {
  const [data, setData] = useState<ChartData | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/charts")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const revenueData = data.monthlyRevenue.map((m) => ({
    month: formatMonthLabel(m.month),
    "POS Sales": m.posCents / 100,
    "Membership": m.invoiceCents / 100,
  }));

  const growthData = data.membershipGrowth.map((m) => ({
    month: formatMonthLabel(m.month),
    "Active": m.active,
  }));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
      >
        <h2 className="text-sm font-semibold">Analytics</h2>
        <span className="text-xs text-gray-400">{collapsed ? "Show" : "Hide"}</span>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* Revenue Trend */}
          <div className="rounded-lg border border-gray-100 p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-2">Monthly Revenue (12 months)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: any) => [`$${Number(value).toFixed(0)}`, undefined]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="POS Sales" fill="#c41111" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Membership" fill="#2563eb" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Membership Growth */}
          <div className="rounded-lg border border-gray-100 p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-2">Active Memberships (12 months)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="Active" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Attendance Trends */}
          <div className="rounded-lg border border-gray-100 p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-2">Weekly Attendance (12 weeks)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.weeklyAttendance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" name="Check-ins" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Lead Sources */}
          <div className="rounded-lg border border-gray-100 p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-2">Lead Sources</h3>
            {data.leadSources.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No lead source data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.leadSources}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {data.leadSources.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
