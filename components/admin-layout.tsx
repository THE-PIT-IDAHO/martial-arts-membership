"use client";

import React, { ReactNode } from "react";

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col w-full h-full">
      {/* Top bar */}
      <header className="shrink-0 bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <div className="flex flex-col leading-none">
          <span className="text-sm font-black tracking-wider uppercase text-gray-800">
            Dojo <span className="italic">Storm</span>
          </span>
          <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-gray-500">
            Platform Admin
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
