"use client";

import React, { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const adminNav = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Manage Gyms", href: "/admin/gyms" },
  { label: "Pricing Tiers", href: "/admin/pricing" },
  { label: "Announcements", href: "/admin/announcements" },
  { label: "Revenue", href: "/admin/revenue" },
  { label: "Support", href: "/admin/support" },
  { label: "Usage Stats", href: "/admin/usage" },
  { label: "Feature Flags", href: "/admin/features" },
  { label: "Onboarding", href: "/admin/onboarding" },
  { label: "Email Campaigns", href: "/admin/campaigns" },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-4 w-full h-full">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between bg-gray-100 border-b border-gray-200 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Platform Admin</span>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1.5 rounded-md hover:bg-gray-200">
          {mobileMenuOpen ? (
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setMobileMenuOpen(false)}>
          <aside className="w-64 h-full bg-white p-4 overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 text-center mb-4">Navigation</p>
            <nav className="space-y-0.5">
              {adminNav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === item.href || pathname?.startsWith(item.href + "/")
                      ? "bg-primary text-white"
                      : "text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-3 overflow-y-auto">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 text-center">
            Navigation
          </p>
        </div>
        <nav className="space-y-0.5">
          {adminNav.map(item => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary text-white" : "text-gray-800 hover:bg-gray-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <section className="flex-1 min-w-0 w-full overflow-y-auto">
        {children}
      </section>
    </div>
  );
}
