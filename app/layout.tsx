// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import RootShell from "./components/RootShell";

export const metadata: Metadata = {
  title: "Dojo Storm Software",
  description: "Martial arts gym management software",
  // Manifest link makes Chrome / Edge on Android treat the app as
  // installable -- combined with a registered service worker (see
  // RootShell) this turns "Add to Home Screen" into the full
  // "Install app" prompt with the DojoStorm icon (192 + 512 SVGs
  // in /public/icons/).
  manifest: "/manifest.json",
  applicationName: "Dojo Storm",
  appleWebApp: {
    capable: true,
    title: "Dojo Storm",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
