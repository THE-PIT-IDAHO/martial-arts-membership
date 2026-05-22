"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Audience = "adult" | "guardian";

type PublicTemplate = {
  id: string;
  name: string;
  slug: string;
  audience: Audience;
  type: string | null;
};

export default function BlankWaiversPage() {
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  // Forwarded onto every card link so admin "New Waiver" emails pre-fill
  // the chosen flow with the existing member's data. Empty string when
  // there's no ?memberId in the URL (true public sign).
  const [memberIdParam, setMemberIdParam] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      setMemberIdParam(sp.get("memberId") || "");
    }
    fetch("/api/public/waiver-templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  // Append the memberId param onto each card link with the right name
  // based on the template's audience: adult uses memberId (re-sign as self),
  // guardian uses parentMemberId (sign on behalf of a child).
  function cardHref(t: PublicTemplate): string {
    const base = `/waivers/sign/${t.slug}`;
    if (!memberIdParam) return base;
    const key = t.audience === "guardian" ? "parentMemberId" : "memberId";
    return `${base}?${key}=${encodeURIComponent(memberIdParam)}`;
  }

  // Group by type so multi-template gyms see "Gym", "Event" etc. with the
  // appropriate cards under each heading. Untyped templates fall under
  // an unlabeled bucket so single-template gyms see no extra headings.
  const grouped = new Map<string, PublicTemplate[]>();
  for (const t of templates) {
    const key = t.type || "";
    const list = grouped.get(key) || [];
    list.push(t);
    grouped.set(key, list);
  }
  const groupKeys = Array.from(grouped.keys()).sort((a, b) => {
    // Untyped (empty key) always last so labeled groups read first.
    if (a === "" && b !== "") return 1;
    if (b === "" && a !== "") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-primary shadow-sm">
        <div className="flex items-center justify-center gap-2.5 px-4 py-2.5">
          <img src="/logo.png" alt="Dojo Storm" className="h-7 w-7 object-contain drop-shadow-md" />
          <div className="flex flex-col leading-none brand-dynamic">
            <span className="text-sm font-black tracking-wider uppercase text-white">
              Dojo <span className="italic">Storm</span>
            </span>
            <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-white/80">
              Software
            </span>
          </div>
        </div>
      </header>

      <div className="py-4 sm:py-8 px-2 sm:px-4">
        <div className="max-w-3xl mx-auto pb-8">
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Liability Waiver</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Please select the appropriate waiver to sign
            </p>
          </div>

          {loading ? (
            <div className="text-center text-sm text-gray-500 py-12">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-gray-500">
              No waivers are available right now. Please check back later or contact the gym.
            </div>
          ) : (
            <div className="space-y-6">
              {groupKeys.map((key) => {
                const items = grouped.get(key) || [];
                return (
                  <div key={key} className="space-y-4">
                    {key && (
                      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        {key}
                      </h2>
                    )}
                    {items.map((t) => (
                      <div
                        key={t.id}
                        className="bg-white border border-gray-200 rounded-xl sm:rounded-lg overflow-hidden shadow-sm"
                      >
                        <div className="bg-primary text-white p-3 sm:p-4">
                          <h3 className="text-base sm:text-lg font-semibold">{t.name}</h3>
                          <p className="text-xs sm:text-sm opacity-90">
                            {t.audience === "guardian"
                              ? "For minors with parent/guardian signature"
                              : "For adult participants (18+)"}
                          </p>
                        </div>
                        <div className="p-3 sm:p-4 text-center">
                          <Link
                            href={cardHref(t)}
                            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primaryDark transition-colors active:scale-[0.98]"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Sign {t.name}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-xs text-gray-500 mt-6">
            This form is securely processed. Your information is kept confidential.
          </p>
        </div>
      </div>
    </div>
  );
}
