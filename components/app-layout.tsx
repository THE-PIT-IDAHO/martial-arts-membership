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
  { label: "Waivers", href: "/waivers", permissionKey: "waivers" },
  { label: "Reports", href: "/reports", permissionKey: "reports" },
  { label: "Tasks", href: "/tasks", permissionKey: "tasks" },
  { label: "Communication", href: "/communication", permissionKey: "communication" },
  { label: "Kiosk Mode", href: "/kiosk/settings", permissionKey: "kiosk" },
  { label: "Audit Log", href: "/audit-log", permissionKey: "audit-log" },
  { label: "Manage Gyms", href: "/admin/gyms", permissionKey: "manage-gyms" },
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

  const visibleNav = permissions
    ? navItems.filter(
        (item) => !item.permissionKey || permissions.includes(item.permissionKey)
      )
    : navItems; // Show all while loading to avoid flash

  return (
    <div className="flex flex-col md:flex-row gap-4 w-full h-full">
      {/* SIDEBAR - fixed, scrollable if content overflows */}
      <aside className="w-full md:w-56 shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-3 md:overflow-y-auto">
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
