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
      <body className="min-h-screen bg-white text-black overflow-hidden">
        <div className="flex flex-col h-screen">
          {/* Top bar - fixed at top */}
          <header className="bg-primary shadow-md flex-shrink-0 z-50 py-3">
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

          <main className="flex-1 overflow-hidden">
            <div className="w-full h-full px-4 sm:px-6 lg:px-8 py-4">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
