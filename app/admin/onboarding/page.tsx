"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type GymOnboarding = { id: string; name: string; slug: string; createdAt: string; members: number; users: number; classes: number; styles: number; hasLogo: boolean; hasSettings: boolean };

export default function OnboardingPage() {
  const [gyms, setGyms] = useState<GymOnboarding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/usage").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setGyms((d.usage || []).map((g: Record<string, unknown>) => ({ ...g, hasLogo: false, hasSettings: (g.classes as number) > 0 })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function getProgress(g: GymOnboarding) {
    let steps = 0;
    if (g.members > 0) steps++;
    if (g.classes > 0) steps++;
    if (g.styles > 0) steps++;
    if (g.users > 1) steps++;
    return steps;
  }

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Onboarding</h1>
          <p className="text-sm text-gray-500">Track which gyms have completed their setup</p>
        </div>

        {loading ? <p className="text-sm text-gray-500">Loading...</p> : gyms.length === 0 ? (
          <p className="text-sm text-gray-500">No gyms to track.</p>
        ) : (
          <div className="space-y-3">
            {gyms.map(g => {
              const progress = getProgress(g);
              const total = 4;
              const pct = Math.round((progress / total) * 100);
              return (
                <div key={g.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{g.name}</h3>
                      <p className="text-xs text-gray-500">{g.slug}.dojostormsoftware.com</p>
                    </div>
                    <span className="text-sm font-bold text-gray-700">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full ${pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-yellow-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded ${g.members > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {g.members > 0 ? "\u2713" : "\u2717"} Members ({g.members})
                    </span>
                    <span className={`px-2 py-0.5 rounded ${g.classes > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {g.classes > 0 ? "\u2713" : "\u2717"} Classes ({g.classes})
                    </span>
                    <span className={`px-2 py-0.5 rounded ${g.styles > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {g.styles > 0 ? "\u2713" : "\u2717"} Styles ({g.styles})
                    </span>
                    <span className={`px-2 py-0.5 rounded ${g.users > 1 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {g.users > 1 ? "\u2713" : "\u2717"} Staff ({g.users})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
