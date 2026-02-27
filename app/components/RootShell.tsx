"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import { ThemeProvider } from "@/components/theme-provider";

const PASSTHROUGH_PREFIXES = ["/portal", "/kiosk", "/waivers/new"];

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPassthrough = PASSTHROUGH_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );

  // Portal and kiosk pages manage their own layout — render children directly
  if (isPassthrough) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  // Admin pages: contained layout with header + overflow-hidden scroll area
  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden">
          <div className="w-full h-full px-4 sm:px-6 lg:px-8 py-4">{children}</div>
        </main>
      </div>
    </ThemeProvider>
  );
}
