"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type GymUsage = { id: string; name: string; slug: string; trialExpiresAt: string | null; createdAt: string; members: number; users: number; classes: number; membershipPlans: number; styles: number };

export default function UsageStatsPage() {
  const [usage, setUsage] = useState<GymUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/usage").then(r => r.ok ? r.json() : null).then(d => { if (d) setUsage(d.usage || []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Usage Stats</h1>
          <p className="text-sm text-gray-500">See what each gym is using across the platform</p>
        </div>

        {loading ? <p className="text-sm text-gray-500">Loading...</p> : usage.length === 0 ? (
          <p className="text-sm text-gray-500">No gym data yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Gym</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Members</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Staff</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Styles</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Classes</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Plans</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usage.map(g => {
                  const expired = g.trialExpiresAt && new Date(g.trialExpiresAt) < new Date();
                  const trial = !!g.trialExpiresAt;
                  return (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{g.name}</p>
                        <p className="text-xs text-gray-500">{g.slug}.dojostormsoftware.com</p>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{g.members}</td>
                      <td className="px-4 py-3 text-center">{g.users}</td>
                      <td className="px-4 py-3 text-center">{g.styles}</td>
                      <td className="px-4 py-3 text-center">{g.classes}</td>
                      <td className="px-4 py-3 text-center">{g.membershipPlans}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${expired ? "bg-red-100 text-red-700" : trial ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                          {expired ? "Expired" : trial ? "Trial" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {new Date(g.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
