import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dojo Storm Software — Gym Management for Martial Arts Schools",
  description:
    "The all-in-one member management, POS, curriculum, and portal software built specifically for martial arts schools. Members, memberships, testing, promotions, and payments in one place.",
};

/**
 * Marketing site chrome. Standalone layout -- no admin AppLayout,
 * no portal bottom-nav. Just a clean top nav + full-width content +
 * footer. Middleware routes www / bare-domain traffic here; the
 * tenant app never renders inside this shell.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {children}
    </div>
  );
}
