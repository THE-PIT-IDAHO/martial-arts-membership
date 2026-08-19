"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import { ThemeProvider } from "@/components/theme-provider";

// Routes rendered WITHOUT the admin app chrome (Header + fixed-height
// scroll trap). Public / self-contained surfaces: portal, kiosk,
// standalone waiver flows. Marketing is handled separately via host
// detection below because middleware REWRITES / -> /marketing --
// usePathname() still returns "/" in the browser, so path-prefix
// matching against "/marketing" never fires. Detecting the host
// client-side is the reliable signal.
const PASSTHROUGH_PREFIXES = ["/portal", "/kiosk", "/waivers/new", "/waivers/sign", "/waiver", "/marketing"];
const PASSTHROUGH_EXCEPTIONS = ["/kiosk/settings"];

/** true when this page is served on the marketing host (www or bare
 *  dojostormsoftware.com). Runs client-side via window.location so
 *  the shell can bypass the admin chrome regardless of what
 *  usePathname() returns after a middleware rewrite. */
function useIsMarketingHost(): boolean {
  const [isMarketing, setIsMarketing] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    // Bare or www. host of the platform's marketing domain.
    // Anything with an extra subdomain (app, admin, <slug>) is app.
    const isBare = host === "dojostormsoftware.com" || host === "www.dojostormsoftware.com";
    setIsMarketing(isBare);
  }, []);
  return isMarketing;
}

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketingHost = useIsMarketingHost();
  const isException = PASSTHROUGH_EXCEPTIONS.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );
  const isPathPassthrough = !isException && PASSTHROUGH_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(p + "/")
  );
  const isPassthrough = isPathPassthrough || isMarketingHost;

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
