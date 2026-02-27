// app/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [gymName, setGymName] = useState("");

  function handleContinue() {
    // Later we can store gymName in DB or global state
    router.push("/dashboard");
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg p-6 space-y-4 border border-gray-200">
        {/* Gym sign in title in BLACK font */}
        <h1 className="text-2xl font-bold text-black text-center">
          Gym Sign-In
        </h1>

        <p className="text-sm text-gray-600 text-center">
          This is your starting point. From here, clients will eventually log in
          and access Dashboard, Members, Classes, Kiosk Mode, and more.
        </p>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-black">
            Gym Name
          </label>
          <input
            type="text"
            placeholder="e.g. Iron Forge Martial Arts"
            value={gymName}
            onChange={(e) => setGymName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="w-full mt-4 inline-flex items-center justify-center rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50"
          disabled={!gymName.trim()}
        >
          Continue
        </button>

        <p className="text-[11px] text-center text-gray-500 pt-2">
          No members, ranks, or classes are pre-loaded. Each gym will customize
          their own programs, memberships, and settings.
        </p>
      </div>
    </div>
  );
}
