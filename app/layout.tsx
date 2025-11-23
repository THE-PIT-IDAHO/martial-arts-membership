// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Martial Arts Membership",
  description: "Custom membership software for martial arts gyms"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black">
        <div className="flex flex-col min-h-screen">
          {/* Top bar */}
          <header className="bg-primary shadow-md">
            <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-wide text-white">
                  Membership Manager
                </span>
                <span className="text-xs uppercase tracking-widest text-white/80">
                  Martial Arts Software
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
