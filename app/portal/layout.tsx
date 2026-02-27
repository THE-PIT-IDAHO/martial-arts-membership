"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNav from "@/components/portal/BottomNav";

const PUBLIC_PATHS = ["/portal/login", "/portal/verify", "/portal/enroll", "/portal/set-password"];

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
      <main className="pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
