"use client";

import React, { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  permissionKey?: string; // Maps to permission system; omit = always visible
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", permissionKey: "dashboard" },
  { label: "Members", href: "/members", permissionKey: "members" },
  { label: "Memberships", href: "/memberships", permissionKey: "memberships" },
  { label: "Styles", href: "/styles", permissionKey: "styles" },
  { label: "Scheduling", href: "/classes", permissionKey: "classes" },
  { label: "Calendar", href: "/calendar", permissionKey: "calendar" },
  { label: "Testing", href: "/testing", permissionKey: "testing" },
  { label: "Curriculum", href: "/curriculum", permissionKey: "curriculum" },
  { label: "Promotions", href: "/promotions", permissionKey: "promotions" },
  { label: "POS (Point of Sale)", href: "/pos", permissionKey: "pos" },
  { label: "Billing", href: "/invoices", permissionKey: "billing" },
  { label: "Contracts", href: "/contracts", permissionKey: "contracts" },
  { label: "Waivers", href: "/waivers", permissionKey: "waivers" },
  { label: "Reports", href: "/reports", permissionKey: "reports" },
  { label: "Tasks", href: "/tasks", permissionKey: "tasks" },
  { label: "Dojo Board", href: "/communication", permissionKey: "communication" },
  { label: "Communications", href: "/communications", permissionKey: "communication" },
  { label: "Kiosk Mode", href: "/kiosk/settings", permissionKey: "kiosk" },
  { label: "Audit Log", href: "/audit-log", permissionKey: "audit-log" },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [logo, setLogo] = useState("");
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [trial, setTrial] = useState<{ isTrial: boolean; expired?: boolean; daysRemaining?: number | null; currentMembers?: number; maxMembers?: number; currentStyles?: number; maxStyles?: number } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.settings && Array.isArray(data.settings)) {
          const logoSetting = data.settings.find((s: { key: string; value: string }) => s.key === "gymLogo");
          if (logoSetting?.value) setLogo(logoSetting.value);
        }
      })
      .catch(() => {});

    fetch("/api/auth/me")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user?.permissions) {
          setPermissions(data.user.permissions);
        }
      })
      .catch(() => {});

    fetch("/api/trial")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setTrial(data); })
      .catch(() => {});
  }, []);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = permissions
    ? navItems.filter(
        (item) => !item.permissionKey || permissions.includes(item.permissionKey)
      )
    : navItems; // Show all while loading to avoid flash

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-4 w-full h-full">
      {/* MOBILE HEADER */}
      <div className="md:hidden flex items-center justify-between bg-gray-100 border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-2">
          {logo && <img src={logo} alt="Gym Logo" className="h-8 object-contain" />}
          <span className="text-sm font-bold text-gray-800">Menu</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-md hover:bg-gray-200"
        >
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

      {/* MOBILE MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setMobileMenuOpen(false)}>
          <aside className="w-64 h-full bg-white p-4 overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            {logo && (
              <div className="mb-4 flex justify-center">
                <img src={logo} alt="Gym Logo" className="h-10 object-contain" />
              </div>
            )}
            <nav className="space-y-0.5">
              {visibleNav.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname?.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-white"
                        : "text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:block w-56 shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-3 overflow-y-auto">
        {logo && (
          <div className="mb-3 flex justify-center">
            <img src={logo} alt="Gym Logo" className="h-10 object-contain" />
          </div>
        )}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Navigation
          </p>
        </div>

        <nav className="space-y-0.5">
          {visibleNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href + "/"));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-gray-800 hover:bg-gray-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT - scrollable */}
      <section className="flex-1 min-w-0 w-full overflow-y-auto">
        {trial?.isTrial && (
          <div className={`px-4 py-2 text-center text-xs font-semibold ${trial.expired ? "bg-red-600 text-white" : trial.daysRemaining != null && trial.daysRemaining <= 7 ? "bg-yellow-400 text-yellow-900" : "bg-blue-500 text-white"}`}>
            {trial.expired
              ? "Your trial has expired. Contact us to upgrade your plan."
              : `Trial: ${trial.daysRemaining} day${trial.daysRemaining === 1 ? "" : "s"} remaining \u2022 ${trial.currentMembers}/${trial.maxMembers} members \u2022 ${trial.currentStyles}/${trial.maxStyles} styles`}
          </div>
        )}
        {children}
      </section>
    </div>
  );
}
