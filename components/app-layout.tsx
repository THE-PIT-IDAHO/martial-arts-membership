"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Members", href: "/members" },
  { label: "Memberships", href: "/memberships" },
  { label: "Styles", href: "/styles" },
  { label: "Classes & Appointments", href: "/classes" },
  { label: "Calendar", href: "/calendar" },
  { label: "Gradings", href: "/grading" },
  { label: "POS (Point of Sale)", href: "/pos" },
  { label: "Waivers", href: "/waivers" },
  { label: "Reports", href: "/reports" },
  { label: "Tasks", href: "/tasks" },
  { label: "Dojo Board", href: "/communication" },
  { label: "Kiosk Mode", href: "/kiosk" }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row gap-4 w-full h-full">
      {/* SIDEBAR - fixed, scrollable if content overflows */}
      <aside className="w-full md:w-56 shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-3 md:overflow-y-auto">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Navigation
          </p>
        </div>

        <nav className="space-y-0.5">
          {navItems.map((item) => {
            // Check exact match or starts with href followed by /
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
      <section className="flex-1 min-w-0 w-full overflow-y-auto">{children}</section>
    </div>
  );
}
