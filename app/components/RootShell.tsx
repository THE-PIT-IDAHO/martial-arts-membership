"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import { ThemeProvider } from "@/components/theme-provider";

// Routes rendered WITHOUT the admin app chrome (Header + fixed-height
// scroll trap). Public / self-contained surfaces: portal, kiosk,
// standalone waiver flows, and the public marketing site at
// /marketing on the www / bare-domain host. Adding marketing here
// lets its layout run its own natural document flow -- the fixed
// h-screen overflow-hidden wrapper below made the landing page
// un-scrollable and rendered the admin Header on top of it.
const PASSTHROUGH_PREFIXES = ["/portal", "/kiosk", "/waivers/new", "/waivers/sign", "/waiver", "/marketing"];
const PASSTHROUGH_EXCEPTIONS = ["/kiosk/settings"];

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isException = PASSTHROUGH_EXCEPTIONS.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );
  const isPassthrough = !isException && PASSTHROUGH_PREFIXES.some(
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
