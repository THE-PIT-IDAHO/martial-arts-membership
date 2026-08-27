"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BottomNav from "@/components/portal/BottomNav";
import AccountSwitcher from "@/components/portal/AccountSwitcher";

// Includes both the internal /portal/* paths AND the bare-subdomain
// URLs that middleware rewrites INTO those paths. usePathname()
// returns the pre-rewrite URL, so a member visiting
// <gym>.dojostormsoftware.com/login sees pathname === "/login" even
// though Next renders /portal/login. Without the bare paths listed
// here, the layout treats the login page as a "private" sub-page and
// starts hitting /api/portal/auth/me + rendering the Back-to-Home
// button around the login form.
const PUBLIC_PATHS = [
  "/portal/login", "/portal/verify", "/portal/enroll", "/portal/set-password", "/portal/reset-password",
  "/login", "/verify", "/enroll", "/set-password", "/reset-password", "/forgot-password",
];

// Pages that have their own menu-bar tab. Anything ELSE the member
// lands on (bookings, attendance, family, styles, testing, …) is a
// sub-page reached from Home, so we surface a Back-to-Home button so
// the member always has a fast way out.
const TOP_NAV_ROUTES = [
  "/portal",
  "/portal/checkin",
  "/portal/classes",
  "/portal/messages",
  "/portal/store",
  "/portal/profile",
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(p + "/"));
  const [passwordChecked, setPasswordChecked] = useState(false);

  // Force password setup for authenticated members without a password
  useEffect(() => {
    if (isPublic) {
      setPasswordChecked(true);
      return;
    }
    fetch("/api/portal/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.mustSetPassword) {
          router.replace("/portal/set-password");
        } else {
          setPasswordChecked(true);
        }
      })
      .catch(() => setPasswordChecked(true));
  }, [isPublic, router]);

  // Register service worker for PWA
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Add PWA meta tags dynamically
  useEffect(() => {
    const meta = (name: string, content: string) => {
      if (!document.querySelector(`meta[name="${name}"]`)) {
        const el = document.createElement("meta");
        el.name = name;
        el.content = content;
        document.head.appendChild(el);
      }
    };

    const link = (rel: string, href: string) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const el = document.createElement("link");
        el.rel = rel;
        el.href = href;
        document.head.appendChild(el);
      }
    };

    meta("theme-color", "#c41111");
    meta("apple-mobile-web-app-capable", "yes");
    meta("apple-mobile-web-app-status-bar-style", "black-translucent");
    meta("apple-mobile-web-app-title", "Dojo Storm");
    link("manifest", "/manifest.json");
    link("apple-touch-icon", "/icons/icon-192.svg");
  }, []);

  if (isPublic) {
    return <>{children}</>;
  }

  if (!passwordChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal Header */}
      <header className="sticky top-0 z-40 bg-primary shadow-sm">
        <div className="flex items-center justify-center gap-2.5 px-4 py-2.5">
          <img src="/logo.png" alt="Dojo Storm" className="h-7 w-7 object-contain drop-shadow-md" />
          <div className="flex flex-col leading-none brand-dynamic">
            <span className="text-sm font-black tracking-wider uppercase">
              Dojo <span className="italic">Storm</span>
            </span>
            <span className="text-[8px] uppercase tracking-[0.25em] font-semibold">
              Software
            </span>
          </div>
        </div>
      </header>
      {/* Menu bar sits directly under the header now (was a fixed
          bottom nav). Component name kept for git history — it's
          just no longer at the bottom. */}
      <BottomNav />
      <AccountSwitcher />
      {/* Back-to-Home button appears on any sub-page (any route not
          reachable directly from the top menu). Kept off PUBLIC pages
          (login / verify / enroll / reset-password / set-password) --
          a "Back to Home" on the login screen was misleading: it
          navigated into /portal, which without a session bounced the
          member right back to login. */}
      {pathname && !TOP_NAV_ROUTES.includes(pathname) && !isPublic && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Back to Home
          </Link>
        </div>
      )}
      <main>
        {children}
      </main>
    </div>
  );
}
