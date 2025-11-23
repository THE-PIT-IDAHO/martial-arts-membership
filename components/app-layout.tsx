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
  { label: "Styles", href: "/styles" },
  { label: "Classes", href: "/classes" },
  { label: "Calendar", href: "/calendar" },
  { label: "Communication", href: "/communication" },
  { label: "Promotions", href: "/promotions" },
  { label: "Waivers", href: "/waivers" },
  { label: "POS (Point of Sale)", href: "/pos" },
  { label: "Kiosk Mode", href: "/kiosk" },
  { label: "Forums", href: "/forums" },
  { label: "Reports", href: "/reports" },
  { label: "Tasks", href: "/tasks" }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row gap-4 w-full">
      {/* SIDEBAR */}
      <aside className="w-full md:w-56 shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-3">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Navigation
          </p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
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

      {/* MAIN CONTENT */}
      <section className="flex-1 min-w-0 w-full">{children}</section>
    </div>
  );
}
