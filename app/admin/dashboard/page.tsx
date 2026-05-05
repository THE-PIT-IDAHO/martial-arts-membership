"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type DashboardData = {
  stats: {
    totalGyms: number;
    totalMembers: number;
    totalUsers: number;
    newGymsThisWeek: number;
    newGymsThisMonth: number;
    newMembersThisWeek: number;
    totalSignups: number;
    activeTrials: number;
    expiredTrials: number;
    activeLinks: number;
  };
  recentGyms: Array<{
    id: string;
    name: string;
    slug: string;
    trialExpiresAt: string | null;
    createdAt: string;
    _count: { members: number; users: number };
  }>;
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Platform Dashboard</h1>

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : !data ? (
          <p className="text-sm text-gray-500">Failed to load dashboard.</p>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
              {[
                { label: "Total Gyms", value: data.stats.totalGyms },
                { label: "Total Members", value: data.stats.totalMembers },
                { label: "Active Trials", value: data.stats.activeTrials },
                { label: "Expired Trials", value: data.stats.expiredTrials },
                { label: "Signup Links", value: data.stats.activeLinks },
                { label: "Total Signups", value: data.stats.totalSignups },
                { label: "New Gyms (Week)", value: data.stats.newGymsThisWeek },
                { label: "New Gyms (Month)", value: data.stats.newGymsThisMonth },
                { label: "New Members (Week)", value: data.stats.newMembersThisWeek },
                { label: "Total Staff", value: data.stats.totalUsers },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold">Recent Gyms</h2>
              </div>
              {data.recentGyms.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No gyms yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data.recentGyms.map(gym => (
                    <div key={gym.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{gym.name}</p>
                        <p className="text-xs text-gray-500">
                          {gym.slug}.dojostormsoftware.com &middot; {gym._count.members} members &middot; {gym._count.users} staff
                        </p>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(gym.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
