"use client";

import React, { ReactNode } from "react";

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-4 w-full h-full">
      {/* Sidebar */}
      <aside className="hidden md:block w-56 shrink-0 rounded-lg bg-gray-100 border border-gray-200 p-3 overflow-y-auto">
        <div className="mb-3 flex justify-center">
          <div className="flex flex-col items-center leading-none">
            <span className="text-sm font-black tracking-wider uppercase text-gray-800">
              Dojo <span className="italic">Storm</span>
            </span>
            <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-gray-500">
              Platform Admin
            </span>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Navigation
          </p>
        </div>
        <nav className="space-y-0.5">
          {/* Future admin nav items go here */}
        </nav>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <div className="flex flex-col leading-none">
          <span className="text-sm font-black tracking-wider uppercase text-gray-800">
            Dojo <span className="italic">Storm</span>
          </span>
          <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-gray-500">
            Platform Admin
          </span>
        </div>
      </div>

      {/* Content */}
      <section className="flex-1 min-w-0 w-full overflow-y-auto">
        {children}
      </section>
    </div>
  );
}
