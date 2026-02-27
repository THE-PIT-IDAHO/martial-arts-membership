// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import RootShell from "./components/RootShell";

export const metadata: Metadata = {
  title: "Dojo Storm Software",
  description: "Martial arts gym management software",
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
